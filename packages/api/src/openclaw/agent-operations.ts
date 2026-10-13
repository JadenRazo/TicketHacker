import { createHash, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lockAgentState } from '../ai/state-guard';
import { automationAllowed } from './action-policy';
import type { OperationKind, OperationScope, OperationSource } from './action-policy';

export function operationId(tenantId: string, ticketId: string, kind: OperationKind, origin: string) {
  return createHash('sha256').update(JSON.stringify([tenantId, ticketId, kind, origin])).digest('hex');
}
const settingsVersion = (tenant: { settings: unknown; updatedAt: Date }) =>
  createHash('sha256').update(JSON.stringify([tenant.updatedAt, tenant.settings])).digest('hex');

export const stopped = (action: 'superseded' | 'uncertain' | 'needs_human', summary: string) =>
  ({ action, confidence: 0, summary, toolCalls: [] });

@Injectable()
export class AgentOperations {
  constructor(private readonly prisma: PrismaService) {}

  // The locks are short lived: no inference, network calls, or emitted effects
  // inside them. Message triggers take this same ticket lock on every edit.
  private async locked<T>(tenantId: string, ticketId: string,
    fn: (tx: Prisma.TransactionClient, ticket: any, tenant: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async tx => {
      const { ticket, tenant } = await lockAgentState(tx, tenantId, ticketId);
      return fn(tx, ticket, tenant);
    });
  }

  async prepare(input: { id?: string; tenantId: string; ticketId: string; kind: OperationKind;
    source: OperationSource; originMessageId?: string | null; predecessorId?: string }) {
    return this.locked(input.tenantId, input.ticketId, async (tx, ticket, tenant) => {
      const id = input.id ?? randomUUID();
      const existing = await tx.agentOperation.findUnique({ where: { id } });
      if (existing) {
        // An implicit manual origin belongs to the original request, not the
        // current thread. Explicit queue/callback identities must still match.
        if (existing.tenantId !== input.tenantId || existing.ticketId !== input.ticketId ||
          existing.kind !== input.kind || existing.source !== input.source ||
          (input.originMessageId !== undefined && existing.originMessageId !== input.originMessageId) ||
          (existing.predecessorId && existing.predecessorId !== input.predecessorId)) {
          throw new Error('Operation identity mismatch');
        }
        return existing;
      }
      const latest = await tx.message.findFirst({
        where: { tenantId: input.tenantId, ticketId: input.ticketId, direction: 'INBOUND', messageType: 'TEXT' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true },
      });
      const originMessageId = input.originMessageId === undefined ? latest?.id ?? null : input.originMessageId;
      let superseded: string | undefined;
      if (input.predecessorId) {
        const parent = await tx.agentOperation.findUnique({ where: { id: input.predecessorId } });
        if (!parent || parent.tenantId !== input.tenantId || parent.ticketId !== input.ticketId ||
          parent.originMessageId !== originMessageId || parent.kind !== 'triage' || parent.source !== 'automation' ||
          input.source !== 'automation' || !['draft', 'auto-reply', 'resolve'].includes(input.kind)) {
          throw new Error('Predecessor identity mismatch');
        }
        // The saved post-commit revision admits only our own triage writes. A
        // human/customer/settings change, including after triage committed,
        // must not be laundered into a fresh reply revision on queue redelivery.
        if (parent.status !== 'COMPLETED' || (parent.result as any)?.action !== 'triaged' ||
          parent.completedTicketVersion !== ticket.agentVersion || parent.settingsVersion !== settingsVersion(tenant)) {
          superseded = 'Triage did not complete against the current ticket and settings';
        }
      }
      if (originMessageId !== (latest?.id ?? null)) {
        if (!input.predecessorId) throw new Error('Originating message has been superseded');
        superseded = 'Originating customer message changed after triage';
      }
      if (!automationAllowed(input.kind, input.source, tenant.settings as any, ticket.channel)) {
        if (!input.predecessorId) throw new Error('Operation disabled');
        superseded = 'Dependent reply automation is disabled';
      }
      return tx.agentOperation.create({ data: { id, tenantId: input.tenantId, ticketId: input.ticketId,
        kind: input.kind, source: input.source, originMessageId, predecessorId: input.predecessorId,
        ticketVersion: ticket.agentVersion, settingsVersion: settingsVersion(tenant),
        status: superseded ? 'SUPERSEDED' : 'PENDING',
        ...(superseded ? { result: stopped('superseded', superseded) } : {}) } });
    });
  }

  private current(op: any, ticket: any, tenant: any) {
    return op.ticketVersion === ticket.agentVersion && op.settingsVersion === settingsVersion(tenant) &&
      automationAllowed(op.kind, op.source, tenant.settings, ticket.channel);
  }

  async claim(id: string, tenantId: string, ticketId: string, kind: OperationKind,
    originMessageId: string | null, source: OperationSource, eventId?: string) {
    return this.locked(tenantId, ticketId, async (tx, ticket, tenant) => {
      const op = await tx.agentOperation.findUnique({ where: { id } });
      if (!op || op.tenantId !== tenantId || op.ticketId !== ticketId || op.kind !== kind ||
        op.originMessageId !== originMessageId || op.source !== source) throw new Error('Operation identity mismatch');
      if (source === 'callback' && (!eventId || (op.callbackEventId && op.callbackEventId !== eventId))) throw new Error('Callback event identity mismatch');
      if (op.result) return { result: op.result as any };
      if (op.status !== 'PENDING') return { result: stopped('uncertain', 'Operation already running or interrupted; automatic replay is disabled') };
      if (!this.current(op, ticket, tenant)) {
        const result = stopped('superseded', 'Ticket or automation settings changed');
        await tx.agentOperation.update({ where: { id }, data: { status: 'SUPERSEDED', result } });
        return { result };
      }
      const claimToken = randomUUID();
      await tx.agentOperation.update({ where: { id }, data: { status: 'RUNNING', claimToken, ...(eventId ? { callbackEventId: eventId } : {}) } });
      const scope: OperationScope = { id, tenantId, ticketId, kind, source, originMessageId, claimToken, pending: [] };
      return { scope };
    });
  }

  async finish(scope: OperationScope, apply: (tx: Prisma.TransactionClient) => Promise<any>) {
    return this.locked(scope.tenantId, scope.ticketId, async (tx, ticket, tenant) => {
      const op = await tx.agentOperation.findUnique({ where: { id: scope.id } });
      if (!op || op.tenantId !== scope.tenantId || op.ticketId !== scope.ticketId ||
        op.kind !== scope.kind || op.source !== scope.source || op.originMessageId !== scope.originMessageId ||
        op.claimToken !== scope.claimToken) throw new Error('Operation claim mismatch');
      if (op.result) return { result: op.result, committed: false };
      if (op.status !== 'RUNNING') return { result: stopped('uncertain', 'Operation is not running'), committed: false };
      if (!this.current(op, ticket, tenant)) {
        const result = stopped('superseded', 'Ticket or automation settings changed while inference was pending');
        await tx.agentOperation.update({ where: { id: op.id }, data: { status: 'SUPERSEDED', result } });
        return { result, committed: false };
      }
      const result = await apply(tx);
      const completed = await tx.ticket.findFirst({ where: { id: scope.ticketId, tenantId: scope.tenantId } });
      if (!completed) throw new Error('Ticket disappeared during operation');
      await tx.agentOperation.update({ where: { id: op.id }, data: { status: 'COMPLETED', result, completedTicketVersion: completed.agentVersion } });
      return { result, committed: true };
    });
  }
}
