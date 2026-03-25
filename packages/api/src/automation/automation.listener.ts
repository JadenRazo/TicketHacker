import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEngine } from './automation.engine';
import { AutomationService } from './automation.service';

@Injectable()
export class AutomationListener {
  private readonly logger = new Logger(AutomationListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly automationEngine: AutomationEngine,
    private readonly automationService: AutomationService,
  ) {}

  @OnEvent('ticket.created')
  async handleTicketCreated(payload: {
    tenantId: string;
    ticket: any;
    triggeredByAutomation?: boolean;
  }): Promise<void> {
    if (payload.triggeredByAutomation) return;
    await this.processAutomations(payload.tenantId, payload.ticket, 'ticket.created');
  }

  @OnEvent('ticket.updated')
  async handleTicketUpdated(payload: {
    tenantId: string;
    ticket: any;
    triggeredByAutomation?: boolean;
  }): Promise<void> {
    if (payload.triggeredByAutomation) return;
    await this.processAutomations(payload.tenantId, payload.ticket, 'ticket.updated');
  }

  /**
   * Evaluates all active automation rules for the tenant against the given
   * ticket. Rules are processed in priority order (highest first). When a
   * rule's actions mutate the ticket, the latest state is re-fetched before
   * evaluating subsequent rules, so downstream rules always see current data.
   *
   * Each rule is only executed once per invocation (tracked via executedRuleIds)
   * to avoid any re-evaluation loop between rules in the same pass.
   */
  private async processAutomations(
    tenantId: string,
    ticket: any,
    eventName: string,
  ): Promise<void> {
    let rules: any[];

    try {
      rules = await this.automationService.findActiveByTenant(tenantId);
    } catch (error) {
      this.logger.error(
        `Failed to fetch automation rules for tenant ${tenantId}`,
        error,
      );
      return;
    }

    if (!rules || rules.length === 0) return;

    const executedRuleIds = new Set<string>();
    let currentTicket = ticket;

    for (const rule of rules) {
      if (executedRuleIds.has(rule.id)) continue;

      let conditionsMatch = false;

      try {
        conditionsMatch = this.automationEngine.evaluateConditions(
          rule.conditions,
          currentTicket,
        );
      } catch (error) {
        this.logger.error(
          `Error evaluating conditions for rule "${rule.name}" (${rule.id}) on ticket ${currentTicket.id}`,
          error,
        );
        continue;
      }

      if (!conditionsMatch) continue;

      this.logger.log(
        `Automation rule "${rule.name}" (${rule.id}) matched ticket ${currentTicket.id} on event "${eventName}"`,
      );

      executedRuleIds.add(rule.id);

      let updatedTicket: any = null;

      try {
        updatedTicket = await this.automationEngine.executeActions(
          rule.actions,
          currentTicket.id,
          tenantId,
        );
      } catch (error) {
        this.logger.error(
          `Error executing actions for rule "${rule.name}" (${rule.id}) on ticket ${currentTicket.id}`,
          error,
        );
        // Continue to the next rule rather than aborting the entire pass
        continue;
      }

      // If the actions changed the ticket, refresh state for subsequent rules
      if (updatedTicket) {
        currentTicket = updatedTicket;
      }
    }
  }
}
