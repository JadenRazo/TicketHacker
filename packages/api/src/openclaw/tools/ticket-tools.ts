import type { Prisma } from '@prisma/client';
import { ALLOWED_TOOLS, MUTATION_TOOLS, argumentError } from '../action-policy';
import type { OperationScope } from '../action-policy';
import { loadThreadContext } from '../../ai/thread-context';

type Database = Prisma.TransactionClient;
interface EffectSink { emit(event: string, payload: any): unknown }

export const TICKET_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_ticket',
      description:
        'Get full ticket details including messages and contact info',
      parameters: {
        type: 'object',
        properties: {
          ticketId: { type: 'string', description: 'The ticket ID to fetch' },
        },
        required: ['ticketId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_ticket',
      description: 'Update ticket status, priority, or assignment',
      parameters: {
        type: 'object',
        properties: {
          ticketId: { type: 'string' },
          status: {
            type: 'string',
            enum: ['OPEN', 'PENDING'],
          },
          priority: {
            type: 'string',
            enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
          },
          assigneeId: { type: 'string' },
        },
        required: ['ticketId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'send_reply',
      description: 'Prepare an UNSENT reply suggestion for human review. This does not deliver a message.',
      parameters: {
        type: 'object',
        properties: {
          ticketId: { type: 'string' },
          content: {
            type: 'string',
            description: 'The reply text to send to the customer',
          },
        },
        required: ['ticketId', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_note',
      description:
        'Add an internal note to a ticket (not visible to the customer)',
      parameters: {
        type: 'object',
        properties: {
          ticketId: { type: 'string' },
          content: {
            type: 'string',
            description: 'The internal note content',
          },
        },
        required: ['ticketId', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_tickets',
      description:
        'Search for related or similar tickets by subject or message content',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to find similar tickets',
          },
          status: {
            type: 'string',
            enum: ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'],
          },
          limit: { type: 'number', description: 'Max results (default 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_contact_history',
      description: "Pull a customer's past tickets and interaction history",
      parameters: {
        type: 'object',
        properties: {
          contactId: { type: 'string' },
        },
        required: ['contactId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'escalate',
      description:
        'Escalate a ticket to a human agent. Use this when the AI cannot resolve the issue or the customer requests a human.',
      parameters: {
        type: 'object',
        properties: {
          ticketId: { type: 'string' },
          reason: {
            type: 'string',
            description: 'Reason for escalation',
          },
        },
        required: ['ticketId', 'reason'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_canned_responses',
      description:
        'Retrieve saved canned responses, optionally filtered by a search query',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Optional search term to filter canned responses by title or content',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_knowledge_base',
      description:
        'Search previously resolved ticket replies to find relevant answers from past support interactions',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term to find relevant past replies',
          },
          limit: {
            type: 'number',
            description: 'Max results to return (default 5)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_tags',
      description: 'Set or replace the tags on a ticket',
      parameters: {
        type: 'object',
        properties: {
          ticketId: { type: 'string' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of tag strings to apply to the ticket',
          },
        },
        required: ['ticketId', 'tags'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'assign_to_team',
      description: 'Assign a ticket to a specific team',
      parameters: {
        type: 'object',
        properties: {
          ticketId: { type: 'string' },
          teamId: {
            type: 'string',
            description: 'The ID of the team to assign the ticket to',
          },
        },
        required: ['ticketId', 'teamId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_teams',
      description: 'List all teams available in the current tenant',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
].map(tool => ({ ...tool, function: { ...tool.function,
  parameters: { ...tool.function.parameters, additionalProperties: false } } }));

export type ToolCallArgs = Record<string, any>;

function failure(error: string) { return JSON.stringify({ error }); }

async function validateCall(toolName: string, args: ToolCallArgs, scope: OperationScope, prisma: Database) {
  if (!scope || !ALLOWED_TOOLS[scope.kind]?.includes(toolName)) return 'Tool is not permitted for this operation';
  const tool = TICKET_TOOLS.find(t => t.function.name === toolName);
  if (!tool) return 'Unknown tool';
  const invalid = argumentError(tool, args);
  if (invalid) return invalid;
  if (args.ticketId && args.ticketId !== scope.ticketId) return 'Ticket is outside the authorized target';
  const ticket = await prisma.ticket.findFirst({ where: { id: scope.ticketId, tenantId: scope.tenantId } });
  if (!ticket) return 'Ticket not found';
  if (args.contactId && args.contactId !== ticket.contactId) return 'Contact is outside the authorized target';
  if (args.assigneeId && !await prisma.user.findFirst({
    where: { id: args.assigneeId, tenantId: scope.tenantId, isActive: true, role: { in: ['OWNER', 'ADMIN', 'AGENT'] } },
  })) return 'Assignee is not an active agent in this tenant';
  if (args.teamId && !await prisma.team.findFirst({ where: { id: args.teamId, tenantId: scope.tenantId } })) return 'Team not found in this tenant';
  // The existing reply path stores suggestions, not confirmed delivery. Never
  // resolve a ticket on the strength of an unsent solution.
  if (['RESOLVED', 'CLOSED'].includes(args.status) && toolName === 'update_ticket') return 'Terminal status requires human confirmation; agent replies are unsent drafts';
  return null;
}

export async function executeToolCall(
  toolName: string, args: ToolCallArgs, scope: OperationScope,
  prisma: Database, callId: string,
): Promise<string> {
  const invalid = await validateCall(toolName, args, scope, prisma);
  if (invalid) return failure(invalid);
  if (MUTATION_TOOLS.includes(toolName)) {
    if (!callId || scope.pending.length >= 40) return failure('Invalid or excessive tool calls');
    const prior = scope.pending.find(t => t.callId === callId);
    if (prior && (prior.name !== toolName || JSON.stringify(prior.args) !== JSON.stringify(args))) return failure('Tool call identity reused with different arguments');
    if (!prior) scope.pending.push({ name: toolName, args, callId });
    return JSON.stringify({ staged: true, applied: false, delivery: 'not_sent' });
  }
  return runTool(toolName, args, scope.tenantId, prisma, { emit() {} });
}

export async function applyPendingTools(scope: OperationScope, prisma: Database, effects: EffectSink) {
  const results: Array<{ tool: string; args: ToolCallArgs; result: string }> = [];
  for (const tool of scope.pending) {
    // Prevent an assignee from being disabled/moved or a team moved/deleted
    // between the final ownership check and its assignment write.
    if (tool.args.assigneeId) await prisma.$queryRaw`SELECT id FROM "User" WHERE id = ${tool.args.assigneeId} AND "tenantId" = ${scope.tenantId} FOR SHARE`;
    if (tool.args.teamId) await prisma.$queryRaw`SELECT id FROM "Team" WHERE id = ${tool.args.teamId} AND "tenantId" = ${scope.tenantId} FOR SHARE`;
    const invalid = await validateCall(tool.name, tool.args, scope, prisma);
    if (invalid) throw new Error(invalid); // roll back the whole operation
    const result = await runTool(tool.name, tool.args, scope.tenantId, prisma, effects);
    if (JSON.parse(result).error) throw new Error('Tool application failed');
    results.push({ tool: tool.name, args: tool.args, result });
  }
  return results;
}

async function runTool(toolName: string, args: ToolCallArgs, tenantId: string, prisma: Database, eventEmitter: EffectSink): Promise<string> {
  switch (toolName) {
    case 'get_ticket': {
      const ticket = await prisma.ticket.findFirst({
        where: { id: args.ticketId, tenantId },
        include: {
          contact: {
            select: {
              id: true,
              tenantId: true,
              name: true,
              email: true,
              metadata: true,
            },
          },
          assignee: { select: { id: true, name: true, tenantId: true } },
          team: { select: { id: true, name: true, tenantId: true } },
        },
      });

      if (!ticket) return JSON.stringify({ error: 'Ticket not found' });

      return JSON.stringify({
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        channel: ticket.channel,
        tags: ticket.tags,
        contact: ticket.contact?.tenantId === tenantId ? ticket.contact : null,
        assignee: ticket.assignee?.tenantId === tenantId ? ticket.assignee : null,
        team: ticket.team?.tenantId === tenantId ? ticket.team : null,
        createdAt: ticket.createdAt,
        context: await loadThreadContext(prisma, tenantId, ticket.id),
        metadata: ticket.metadata,
      });
    }

    case 'update_ticket': {
      const updateData: any = {};
      if (args.status) updateData.status = args.status;
      if (args.priority) updateData.priority = args.priority;
      if (args.assigneeId) updateData.assigneeId = args.assigneeId;

      if (args.status === 'RESOLVED') updateData.resolvedAt = new Date();
      if (args.status === 'CLOSED') updateData.closedAt = new Date();

      const updated = await prisma.ticket.update({
        where: { id: args.ticketId, tenantId },
        data: updateData,
      });

      eventEmitter.emit('ticket.updated', { tenantId, ticket: updated });

      return JSON.stringify({
        success: true,
        ticket: {
          id: updated.id,
          status: updated.status,
          priority: updated.priority,
          assigneeId: updated.assigneeId,
        },
      });
    }

    case 'send_reply': {
      const message = await prisma.message.create({
        data: {
          tenantId,
          ticketId: args.ticketId,
          direction: 'OUTBOUND',
          contentText: args.content,
          messageType: 'AI_SUGGESTION',
          metadata: { aiGenerated: true, deliveryStatus: 'not_sent' },
        },
      });

      return JSON.stringify({
        success: true,
        delivery: 'not_sent',
        draft: true,
        messageId: message.id,
      });
    }

    case 'add_note': {
      const note = await prisma.message.create({
        data: {
          tenantId,
          ticketId: args.ticketId,
          direction: 'OUTBOUND',
          contentText: args.content,
          messageType: 'NOTE',
        },
      });

      return JSON.stringify({
        success: true,
        messageId: note.id,
      });
    }

    case 'search_tickets': {
      const limit = args.limit || 5;
      const where: any = {
        tenantId,
        OR: [
          { subject: { contains: args.query, mode: 'insensitive' } },
          {
            messages: {
              some: {
                tenantId,
                contentText: { contains: args.query, mode: 'insensitive' },
              },
            },
          },
        ],
      };
      if (args.status) where.status = args.status;

      const tickets = await prisma.ticket.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
          tags: true,
          messages: {
            where: {
              tenantId,
              contentText: { contains: args.query, mode: 'insensitive' },
            },
            take: 1,
            orderBy: { createdAt: 'asc' },
            select: { id: true, direction: true, messageType: true, contentText: true },
          },
        },
      });

      return JSON.stringify({
        tickets: tickets.map((t) => ({
          id: t.id,
          subject: t.subject,
          status: t.status,
          priority: t.priority,
          createdAt: t.createdAt,
          tags: t.tags,
          matchingMessageId: t.messages[0]?.id,
          matchingMessageType: t.messages[0]?.messageType,
          matchingDirection: t.messages[0]?.direction,
          matchingSnippet:
            t.messages.length > 0
              ? t.messages[0].contentText.slice(0, 200)
              : undefined,
        })),
      });
    }

    case 'get_contact_history': {
      const contact = await prisma.contact.findFirst({
        where: { id: args.contactId, tenantId },
        include: {
          tickets: {
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              subject: true,
              status: true,
              priority: true,
              createdAt: true,
              resolvedAt: true,
            },
          },
        },
      });

      if (!contact) return JSON.stringify({ error: 'Contact not found' });

      return JSON.stringify({
        contact: {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          ticketCount: contact.tickets.length,
          tickets: contact.tickets,
        },
      });
    }

    case 'escalate': {
      const previous = await prisma.ticket.findFirst({ where: { id: args.ticketId, tenantId } });
      const ticket = await prisma.ticket.update({
        where: { id: args.ticketId, tenantId },
        data: {
          status: 'OPEN',
          metadata: {
            ...((previous?.metadata as Record<string, any>) ?? {}),
            escalation: {
              reason: args.reason,
              escalatedAt: new Date().toISOString(),
              escalatedBy: 'ai-agent',
            },
          },
        },
      });

      await prisma.message.create({
        data: {
          tenantId,
          ticketId: args.ticketId,
          direction: 'OUTBOUND',
          contentText: `Escalated to human agent. Reason: ${args.reason}`,
          messageType: 'SYSTEM',
        },
      });

      eventEmitter.emit('ticket.updated', { tenantId, ticket });

      return JSON.stringify({
        success: true,
        escalated: true,
        reason: args.reason,
      });
    }

    case 'get_canned_responses': {
      const where: any = { tenantId };

      if (args.query) {
        where.OR = [
          { title: { contains: args.query, mode: 'insensitive' } },
          { content: { contains: args.query, mode: 'insensitive' } },
        ];
      }

      const responses = await prisma.cannedResponse.findMany({
        where,
        orderBy: { usageCount: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          content: true,
          shortcut: true,
        },
      });

      return JSON.stringify({ cannedResponses: responses });
    }

    case 'search_knowledge_base': {
      const limit = args.limit || 5;

      const messages = await prisma.message.findMany({
        where: {
          tenantId,
          contentText: { contains: args.query, mode: 'insensitive' },
          messageType: 'TEXT',
          direction: 'OUTBOUND',
          ticket: { status: 'RESOLVED', tenantId },
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          contentText: true,
          createdAt: true,
          ticket: {
            select: {
              id: true,
              subject: true,
            },
          },
        },
      });

      return JSON.stringify({
        results: messages.map((m) => ({
          messageId: m.id,
          messageType: 'TEXT',
          direction: 'OUTBOUND',
          delivery: 'unknown',
          ticketId: m.ticket.id,
          ticketSubject: m.ticket.subject,
          snippet: m.contentText.slice(0, 300),
          createdAt: m.createdAt,
        })),
      });
    }

    case 'set_tags': {
      const updated = await prisma.ticket.update({
        where: { id: args.ticketId, tenantId },
        data: { tags: args.tags },
      });

      eventEmitter.emit('ticket.updated', { tenantId, ticket: updated });

      return JSON.stringify({
        success: true,
        ticketId: updated.id,
        tags: updated.tags,
      });
    }

    case 'assign_to_team': {
      const team = await prisma.team.findFirst({
        where: { id: args.teamId, tenantId },
      });

      if (!team) return JSON.stringify({ error: 'Team not found' });

      const updated = await prisma.ticket.update({
        where: { id: args.ticketId, tenantId },
        data: { teamId: args.teamId },
      });

      eventEmitter.emit('ticket.updated', { tenantId, ticket: updated });

      return JSON.stringify({
        success: true,
        ticketId: updated.id,
        teamId: updated.teamId,
      });
    }

    case 'get_teams': {
      const teams = await prisma.team.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          description: true,
        },
      });

      return JSON.stringify({ teams });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
