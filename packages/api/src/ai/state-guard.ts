import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export async function lockAgentState(tx: Prisma.TransactionClient, tenantId: string, ticketId: string) {
  await tx.$queryRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
  const guards = await tx.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*) AS count FROM pg_trigger
    WHERE ((tgname = 'ticket_agent_version' AND tgrelid = '"Ticket"'::regclass)
      OR (tgname = 'message_agent_version' AND tgrelid = '"Message"'::regclass))
      AND tgenabled = 'O' AND NOT tgisinternal`;
  if (Number(guards[0]?.count) !== 2) throw new Error('Agent integrity migration is required');
  // Block settings updates while allowing unrelated child FK checks.
  await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
  const ticket = await tx.ticket.findFirst({ where: { id: ticketId, tenantId } });
  if (!tenant || !ticket) throw new Error('Ticket not found');
  return { tenant, ticket };
}

export async function applyClassificationIfCurrent(prisma: PrismaService,
  tenantId: string, ticketId: string, expectedVersion: number, expectedSettings: unknown,
  classification: unknown, priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT') {
  return prisma.$transaction(async tx => {
    const { ticket, tenant } = await lockAgentState(tx, tenantId, ticketId);
    const settings = tenant.settings as Record<string, unknown>;
    if (ticket.agentVersion !== expectedVersion || settings.aiEnabled === false ||
      JSON.stringify(settings) !== JSON.stringify(expectedSettings)) return false;
    await tx.ticket.update({ where: { id: ticketId, tenantId }, data: {
      ...(priority ? { priority } : {}),
      metadata: { ...(ticket.metadata as Record<string, any>), aiClassification: classification as any },
    } });
    return true;
  });
}
