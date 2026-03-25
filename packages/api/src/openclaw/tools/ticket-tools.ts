import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export const TICKET_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_ticket',
      description: 'Get full ticket details including messages and contact info',
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
            enum: ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'],
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
      description: 'Send a reply message to the customer on a ticket',
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
      description: 'Add an internal note to a ticket (not visible to the customer)',
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
      description: 'Search for related or similar tickets by subject or message content',
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
      description: 'Retrieve saved canned responses, optionally filtered by a search query',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optional search term to filter canned responses by title or content',
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
          teamId: { type: 'string', description: 'The ID of the team to assign the ticket to' },
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
];

export type ToolCallArgs = Record<string, any>;

export async function executeToolCall(
  toolName: string,
  args: ToolCallArgs,
  tenantId: string,
  prisma: PrismaService,
  eventEmitter: EventEmitter2,
): Promise<string> {
  switch (toolName) {
    case 'get_ticket': {
      const ticket = await prisma.ticket.findFirst({
        where: { id: args.ticketId, tenantId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 20,
            select: {
              id: true,
              direction: true,
              contentText: true,
              messageType: true,
              createdAt: true,
            },
          },
          contact: {
            select: {
              id: true,
              name: true,
              email: true,
              metadata: true,
            },
          },
          assignee: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
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
        contact: ticket.contact,
        assignee: ticket.assignee,
        team: ticket.team,
        createdAt: ticket.createdAt,
        messages: ticket.messages,
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
        where: { id: args.ticketId },
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
        },
      });

      eventEmitter.emit('message.created', {
        tenantId,
        ticketId: args.ticketId,
        message,
      });

      return JSON.stringify({
        success: true,
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

      eventEmitter.emit('message.created', {
        tenantId,
        ticketId: args.ticketId,
        message: note,
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
              some: { contentText: { contains: args.query, mode: 'insensitive' } },
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
            where: { contentText: { contains: args.query, mode: 'insensitive' } },
            take: 1,
            orderBy: { createdAt: 'asc' },
            select: { contentText: true },
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
          matchingSnippet:
            t.messages.length > 0 ? t.messages[0].contentText.slice(0, 200) : undefined,
        })),
      });
    }

    case 'get_contact_history': {
      const contact = await prisma.contact.findFirst({
        where: { id: args.contactId, tenantId },
        include: {
          tickets: {
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
      const ticket = await prisma.ticket.update({
        where: { id: args.ticketId },
        data: {
          status: 'OPEN',
          metadata: {
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
          ticket: { status: 'RESOLVED' },
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
          ticketId: m.ticket.id,
          ticketSubject: m.ticket.subject,
          snippet: m.contentText.slice(0, 300),
          createdAt: m.createdAt,
        })),
      });
    }

    case 'set_tags': {
      const updated = await prisma.ticket.update({
        where: { id: args.ticketId },
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
        where: { id: args.ticketId },
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
