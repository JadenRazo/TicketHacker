import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus, Priority, MessageType, MessageDirection } from '@prisma/client';

@Injectable()
export class AutomationEngine {
  private readonly logger = new Logger(AutomationEngine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Evaluates a conditions block against a ticket object.
   *
   * Conditions support two top-level grouping keys:
   *   "all"  -> every condition must match (AND)
   *   "any"  -> at least one condition must match (OR)
   *
   * Each condition: { field, operator, value? }
   */
  evaluateConditions(conditions: any, ticket: any): boolean {
    if (!conditions || typeof conditions !== 'object') {
      return false;
    }

    if (Array.isArray(conditions.all)) {
      return conditions.all.every((c: any) => this.evaluateSingleCondition(c, ticket));
    }

    if (Array.isArray(conditions.any)) {
      return conditions.any.some((c: any) => this.evaluateSingleCondition(c, ticket));
    }

    // Unrecognised structure — treat as no match rather than a silent pass
    this.logger.warn('Automation conditions must have an "all" or "any" key');
    return false;
  }

  private evaluateSingleCondition(condition: any, ticket: any): boolean {
    if (!condition || typeof condition !== 'object') {
      return false;
    }

    const { field, operator, value } = condition;

    if (!field || !operator) {
      return false;
    }

    const ticketValue = this.resolveField(field, ticket);

    switch (operator) {
      case 'equals':
        return this.opEquals(ticketValue, value);

      case 'not_equals':
        return !this.opEquals(ticketValue, value);

      case 'in':
        if (!Array.isArray(value)) return false;
        return value.some((v: any) => this.opEquals(ticketValue, v));

      case 'contains':
        return this.opContains(ticketValue, value);

      case 'starts_with':
        if (ticketValue === null || ticketValue === undefined) return false;
        return String(ticketValue).toLowerCase().startsWith(String(value).toLowerCase());

      case 'is_empty':
        return this.opIsEmpty(ticketValue);

      case 'is_not_empty':
        return !this.opIsEmpty(ticketValue);

      default:
        this.logger.warn(`Unknown automation operator: ${operator}`);
        return false;
    }
  }

  private resolveField(field: string, ticket: any): any {
    const supported = ['status', 'priority', 'channel', 'tags', 'subject', 'assigneeId', 'teamId', 'contactId'];
    if (!supported.includes(field)) {
      this.logger.warn(`Unsupported automation field: ${field}`);
      return undefined;
    }
    return ticket[field];
  }

  private opEquals(ticketValue: any, ruleValue: any): boolean {
    if (ticketValue === null || ticketValue === undefined) {
      return ruleValue === null || ruleValue === undefined;
    }
    return String(ticketValue).toLowerCase() === String(ruleValue).toLowerCase();
  }

  private opContains(ticketValue: any, ruleValue: any): boolean {
    if (ticketValue === null || ticketValue === undefined) return false;

    // Array field (e.g. tags): check membership
    if (Array.isArray(ticketValue)) {
      return ticketValue.some((v: any) =>
        String(v).toLowerCase() === String(ruleValue).toLowerCase(),
      );
    }

    // String field: substring match
    return String(ticketValue).toLowerCase().includes(String(ruleValue).toLowerCase());
  }

  private opIsEmpty(ticketValue: any): boolean {
    if (ticketValue === null || ticketValue === undefined) return true;
    if (typeof ticketValue === 'string') return ticketValue.trim() === '';
    if (Array.isArray(ticketValue)) return ticketValue.length === 0;
    return false;
  }

  /**
   * Executes a set of actions against a ticket.
   *
   * Field-level changes (status, priority, assigneeId, teamId, tags) are
   * batched into a single prisma.ticket.update call. Message actions
   * (add_note, send_reply) are created individually afterward.
   *
   * Returns the updated ticket if any field was changed, or null otherwise.
   */
  async executeActions(
    actions: any,
    ticketId: string,
    tenantId: string,
  ): Promise<any | null> {
    if (!actions || !Array.isArray(actions.actions)) {
      return null;
    }

    const ticketUpdate: Record<string, any> = {};
    const noteActions: string[] = [];
    const replyActions: string[] = [];

    for (const action of actions.actions) {
      if (!action || typeof action !== 'object' || !action.type) {
        continue;
      }

      switch (action.type) {
        case 'set_status': {
          const status = this.resolveStatus(action.value);
          if (status) {
            ticketUpdate.status = status;
            if (status === TicketStatus.RESOLVED) {
              ticketUpdate.resolvedAt = new Date();
            } else if (status === TicketStatus.CLOSED) {
              ticketUpdate.closedAt = new Date();
            }
          }
          break;
        }

        case 'set_priority': {
          const priority = this.resolvePriority(action.value);
          if (priority) {
            ticketUpdate.priority = priority;
          }
          break;
        }

        case 'set_assignee':
          ticketUpdate.assigneeId = action.value || null;
          break;

        case 'set_team':
          ticketUpdate.teamId = action.value || null;
          break;

        case 'add_tags': {
          // Tags are merged during the update; we fetch current tags below
          const newTags = Array.isArray(action.value) ? action.value : [action.value];
          ticketUpdate._addTags = (ticketUpdate._addTags || []).concat(newTags);
          break;
        }

        case 'add_note':
          if (action.value) {
            noteActions.push(String(action.value));
          }
          break;

        case 'send_reply':
          if (action.value) {
            replyActions.push(String(action.value));
          }
          break;

        default:
          this.logger.warn(`Unknown automation action type: ${action.type}`);
      }
    }

    // Resolve tag merging if needed
    if (ticketUpdate._addTags) {
      const current = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { tags: true },
      });
      const existingTags: string[] = current?.tags ?? [];
      const merged = Array.from(new Set([...existingTags, ...ticketUpdate._addTags]));
      ticketUpdate.tags = merged;
      delete ticketUpdate._addTags;
    }

    let updatedTicket: any = null;

    // Apply field-level updates in one shot
    if (Object.keys(ticketUpdate).length > 0) {
      try {
        updatedTicket = await this.prisma.ticket.update({
          where: { id: ticketId },
          data: ticketUpdate,
        });

        this.eventEmitter.emit('ticket.updated', {
          tenantId,
          ticket: updatedTicket,
          triggeredByAutomation: true,
        });
      } catch (error) {
        this.logger.error(
          `Failed to apply ticket field updates for ticket ${ticketId}`,
          error,
        );
      }
    }

    // Create notes
    for (const noteText of noteActions) {
      try {
        const note = await this.prisma.message.create({
          data: {
            tenantId,
            ticketId,
            direction: MessageDirection.OUTBOUND,
            contentText: noteText,
            messageType: MessageType.NOTE,
          },
        });

        this.eventEmitter.emit('message.created', {
          tenantId,
          ticketId,
          message: note,
          triggeredByAutomation: true,
        });
      } catch (error) {
        this.logger.error(
          `Failed to create automation note for ticket ${ticketId}`,
          error,
        );
      }
    }

    // Create outbound reply messages
    for (const replyText of replyActions) {
      try {
        const reply = await this.prisma.message.create({
          data: {
            tenantId,
            ticketId,
            direction: MessageDirection.OUTBOUND,
            contentText: replyText,
            messageType: MessageType.TEXT,
          },
        });

        this.eventEmitter.emit('message.created', {
          tenantId,
          ticketId,
          message: reply,
          triggeredByAutomation: true,
        });
      } catch (error) {
        this.logger.error(
          `Failed to create automation reply for ticket ${ticketId}`,
          error,
        );
      }
    }

    return updatedTicket;
  }

  private resolveStatus(value: any): TicketStatus | null {
    const map: Record<string, TicketStatus> = {
      OPEN: TicketStatus.OPEN,
      PENDING: TicketStatus.PENDING,
      RESOLVED: TicketStatus.RESOLVED,
      CLOSED: TicketStatus.CLOSED,
    };
    const key = String(value).toUpperCase();
    if (!map[key]) {
      this.logger.warn(`Invalid ticket status value in automation action: ${value}`);
      return null;
    }
    return map[key];
  }

  private resolvePriority(value: any): Priority | null {
    const map: Record<string, Priority> = {
      LOW: Priority.LOW,
      NORMAL: Priority.NORMAL,
      HIGH: Priority.HIGH,
      URGENT: Priority.URGENT,
    };
    const key = String(value).toUpperCase();
    if (!map[key]) {
      this.logger.warn(`Invalid priority value in automation action: ${value}`);
      return null;
    }
    return map[key];
  }
}
