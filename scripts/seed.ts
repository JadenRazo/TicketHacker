import { PrismaClient, Plan, Role, TicketStatus, Priority, Channel, MessageDirection, MessageType, CannedResponseScope, MacroScope, CustomFieldType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://tickethacker:tickethacker@localhost:5434/tickethacker?schema=public'
    }
  }
});

async function main() {
  console.log('Starting database seed...\n');

  // Clear existing data in correct order (respect FK constraints)
  console.log('Clearing existing data...');
  await prisma.attachment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.savedView.deleteMany();
  await prisma.macro.deleteMany();
  await prisma.automationRule.deleteMany();
  await prisma.customFieldDefinition.deleteMany();
  await prisma.cannedResponse.deleteMany();
  await prisma.platformConnection.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  console.log('Existing data cleared.\n');

  // Hash password once for all users
  const passwordHash = await argon2.hash('password123');

  // Create Tenants
  console.log('Creating tenants...');
  const acmeCorp = await prisma.tenant.create({
    data: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: Plan.GROWTH,
      settings: {
        branding: {
          primaryColor: '#2563eb',
          secondaryColor: '#1e40af'
        },
        sla: {
          firstResponseMinutes: 60,
          resolutionMinutes: 480
        },
        businessHours: {
          monday: { start: '09:00', end: '17:00' },
          tuesday: { start: '09:00', end: '17:00' },
          wednesday: { start: '09:00', end: '17:00' },
          thursday: { start: '09:00', end: '17:00' },
          friday: { start: '09:00', end: '17:00' }
        },
        autoAssignment: {
          enabled: true,
          strategy: 'round-robin'
        }
      }
    }
  });

  const betaInc = await prisma.tenant.create({
    data: {
      name: 'Beta Inc',
      slug: 'beta-inc',
      plan: Plan.PRO,
      settings: {
        branding: {
          primaryColor: '#dc2626',
          secondaryColor: '#b91c1c'
        },
        sla: {
          firstResponseMinutes: 30,
          resolutionMinutes: 240
        },
        widget: {
          enabled: true,
          greeting: 'Welcome to Beta Inc Support! How can we help you today?',
          position: 'bottom-right'
        }
      }
    }
  });
  console.log(`Created tenants: ${acmeCorp.name}, ${betaInc.name}\n`);

  // Create Users for Acme Corp
  console.log('Creating users...');
  const acmeOwner = await prisma.user.create({
    data: {
      tenantId: acmeCorp.id,
      email: 'owner@acme-corp.com',
      name: 'Alice Owner',
      role: Role.OWNER,
      passwordHash,
      preferences: {}
    }
  });

  const acmeAdmin = await prisma.user.create({
    data: {
      tenantId: acmeCorp.id,
      email: 'admin@acme-corp.com',
      name: 'Bob Admin',
      role: Role.ADMIN,
      passwordHash,
      preferences: {}
    }
  });

  const acmeAgent = await prisma.user.create({
    data: {
      tenantId: acmeCorp.id,
      email: 'agent@acme-corp.com',
      name: 'Carol Agent',
      role: Role.AGENT,
      passwordHash,
      preferences: {
        darkMode: true,
        notifications: {
          email: true,
          desktop: true
        }
      }
    }
  });

  // Create Users for Beta Inc
  const betaOwner = await prisma.user.create({
    data: {
      tenantId: betaInc.id,
      email: 'owner@beta-inc.com',
      name: 'Dave Owner',
      role: Role.OWNER,
      passwordHash,
      preferences: {}
    }
  });

  const betaAdmin = await prisma.user.create({
    data: {
      tenantId: betaInc.id,
      email: 'admin@beta-inc.com',
      name: 'Eve Admin',
      role: Role.ADMIN,
      passwordHash,
      preferences: {}
    }
  });

  const betaAgent = await prisma.user.create({
    data: {
      tenantId: betaInc.id,
      email: 'agent@beta-inc.com',
      name: 'Frank Agent',
      role: Role.AGENT,
      passwordHash,
      preferences: {}
    }
  });
  console.log(`Created 6 users (3 per tenant)\n`);

  // Create Teams
  console.log('Creating teams...');
  const acmeTeam = await prisma.team.create({
    data: {
      tenantId: acmeCorp.id,
      name: 'Support',
      description: 'Primary customer support team'
    }
  });

  const betaTeam = await prisma.team.create({
    data: {
      tenantId: betaInc.id,
      name: 'Support',
      description: 'Customer support and technical assistance'
    }
  });

  // Add agents to teams
  await prisma.teamMember.create({
    data: {
      tenantId: acmeCorp.id,
      teamId: acmeTeam.id,
      userId: acmeAgent.id
    }
  });

  await prisma.teamMember.create({
    data: {
      tenantId: betaInc.id,
      teamId: betaTeam.id,
      userId: betaAgent.id
    }
  });
  console.log(`Created teams with agent members\n`);

  // Create Contacts for Acme Corp
  console.log('Creating contacts...');
  const acmeContacts = await Promise.all([
    prisma.contact.create({
      data: {
        tenantId: acmeCorp.id,
        externalId: 'widget-user-001',
        name: 'John Smith',
        email: 'john.smith@example.com',
        channel: Channel.CHAT_WIDGET,
        metadata: { source: 'website', page: '/pricing' }
      }
    }),
    prisma.contact.create({
      data: {
        tenantId: acmeCorp.id,
        externalId: 'discord-123456789',
        name: 'DiscordUser#1234',
        channel: Channel.DISCORD,
        metadata: { serverId: 'acme-discord-server' }
      }
    }),
    prisma.contact.create({
      data: {
        tenantId: acmeCorp.id,
        externalId: 'telegram-987654321',
        name: 'Sarah Johnson',
        channel: Channel.TELEGRAM,
        metadata: { username: '@sarahj' }
      }
    }),
    prisma.contact.create({
      data: {
        tenantId: acmeCorp.id,
        externalId: 'email-mike@customer.com',
        name: 'Mike Wilson',
        email: 'mike@customer.com',
        channel: Channel.EMAIL,
        metadata: {}
      }
    }),
    prisma.contact.create({
      data: {
        tenantId: acmeCorp.id,
        externalId: 'api-client-abc123',
        name: 'API Integration',
        channel: Channel.API,
        metadata: { clientId: 'abc123', version: '1.0' }
      }
    })
  ]);

  // Create Contacts for Beta Inc
  const betaContacts = await Promise.all([
    prisma.contact.create({
      data: {
        tenantId: betaInc.id,
        externalId: 'widget-user-501',
        name: 'Emma Davis',
        email: 'emma.davis@example.com',
        channel: Channel.CHAT_WIDGET,
        metadata: { source: 'dashboard', userAgent: 'Chrome' }
      }
    }),
    prisma.contact.create({
      data: {
        tenantId: betaInc.id,
        externalId: 'discord-555666777',
        name: 'DiscordFan#5678',
        channel: Channel.DISCORD,
        metadata: { serverId: 'beta-community' }
      }
    }),
    prisma.contact.create({
      data: {
        tenantId: betaInc.id,
        externalId: 'telegram-111222333',
        name: 'Alex Brown',
        channel: Channel.TELEGRAM,
        metadata: { username: '@alexb' }
      }
    }),
    prisma.contact.create({
      data: {
        tenantId: betaInc.id,
        externalId: 'email-lisa@client.com',
        name: 'Lisa Anderson',
        email: 'lisa@client.com',
        channel: Channel.EMAIL,
        metadata: {}
      }
    }),
    prisma.contact.create({
      data: {
        tenantId: betaInc.id,
        externalId: 'api-client-xyz789',
        name: 'Mobile App',
        channel: Channel.API,
        metadata: { clientId: 'xyz789', platform: 'iOS' }
      }
    })
  ]);
  console.log(`Created 10 contacts (5 per tenant)\n`);

  // Create Custom Field Definitions
  console.log('Creating custom field definitions...');
  await Promise.all([
    prisma.customFieldDefinition.create({
      data: {
        tenantId: acmeCorp.id,
        name: 'Order ID',
        fieldType: CustomFieldType.TEXT,
        isRequired: true
      }
    }),
    prisma.customFieldDefinition.create({
      data: {
        tenantId: acmeCorp.id,
        name: 'Product',
        fieldType: CustomFieldType.DROPDOWN,
        options: ['Basic', 'Pro', 'Enterprise']
      }
    }),
    prisma.customFieldDefinition.create({
      data: {
        tenantId: acmeCorp.id,
        name: 'Priority Level',
        fieldType: CustomFieldType.NUMBER
      }
    }),
    prisma.customFieldDefinition.create({
      data: {
        tenantId: betaInc.id,
        name: 'Order ID',
        fieldType: CustomFieldType.TEXT,
        isRequired: true
      }
    }),
    prisma.customFieldDefinition.create({
      data: {
        tenantId: betaInc.id,
        name: 'Product',
        fieldType: CustomFieldType.DROPDOWN,
        options: ['Basic', 'Pro', 'Enterprise']
      }
    }),
    prisma.customFieldDefinition.create({
      data: {
        tenantId: betaInc.id,
        name: 'Priority Level',
        fieldType: CustomFieldType.NUMBER
      }
    })
  ]);
  console.log(`Created custom field definitions\n`);

  // Create Tickets for Acme Corp
  console.log('Creating tickets...');
  const acmeTickets = [];
  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now
  const slaDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

  acmeTickets.push(await prisma.ticket.create({
    data: {
      tenantId: acmeCorp.id,
      subject: 'Cannot login to my account',
      status: TicketStatus.OPEN,
      priority: Priority.HIGH,
      channel: Channel.CHAT_WIDGET,
      contactId: acmeContacts[0].id,
      assigneeId: acmeAgent.id,
      teamId: acmeTeam.id,
      tags: ['technical', 'login'],
      slaDeadline,
      customFields: { 'Order ID': 'ORD-12345', 'Product': 'Pro' }
    }
  }));

  acmeTickets.push(await prisma.ticket.create({
    data: {
      tenantId: acmeCorp.id,
      subject: 'Billing question about recent charge',
      status: TicketStatus.OPEN,
      priority: Priority.URGENT,
      channel: Channel.EMAIL,
      contactId: acmeContacts[3].id,
      assigneeId: acmeAgent.id,
      teamId: acmeTeam.id,
      tags: ['billing', 'urgent'],
      customFields: { 'Order ID': 'ORD-12346' }
    }
  }));

  acmeTickets.push(await prisma.ticket.create({
    data: {
      tenantId: acmeCorp.id,
      subject: 'Feature request for API',
      status: TicketStatus.OPEN,
      priority: Priority.LOW,
      channel: Channel.API,
      contactId: acmeContacts[4].id,
      tags: ['enhancement', 'api']
    }
  }));

  acmeTickets.push(await prisma.ticket.create({
    data: {
      tenantId: acmeCorp.id,
      subject: 'Discord integration not working',
      status: TicketStatus.OPEN,
      priority: Priority.NORMAL,
      channel: Channel.DISCORD,
      contactId: acmeContacts[1].id,
      assigneeId: acmeAgent.id,
      tags: ['technical', 'bug']
    }
  }));

  acmeTickets.push(await prisma.ticket.create({
    data: {
      tenantId: acmeCorp.id,
      subject: 'Need help with setup',
      status: TicketStatus.PENDING,
      priority: Priority.NORMAL,
      channel: Channel.TELEGRAM,
      contactId: acmeContacts[2].id,
      snoozedUntil: futureDate,
      tags: ['onboarding']
    }
  }));

  acmeTickets.push(await prisma.ticket.create({
    data: {
      tenantId: acmeCorp.id,
      subject: 'Report generation issue',
      status: TicketStatus.PENDING,
      priority: Priority.HIGH,
      channel: Channel.CHAT_WIDGET,
      contactId: acmeContacts[0].id,
      assigneeId: acmeAgent.id,
      tags: ['technical', 'reporting']
    }
  }));

  acmeTickets.push(await prisma.ticket.create({
    data: {
      tenantId: acmeCorp.id,
      subject: 'Thank you for the service',
      status: TicketStatus.PENDING,
      priority: Priority.LOW,
      channel: Channel.EMAIL,
      contactId: acmeContacts[3].id,
      tags: ['feedback']
    }
  }));

  acmeTickets.push(await prisma.ticket.create({
    data: {
      tenantId: acmeCorp.id,
      subject: 'Payment method update',
      status: TicketStatus.RESOLVED,
      priority: Priority.NORMAL,
      channel: Channel.CHAT_WIDGET,
      contactId: acmeContacts[0].id,
      assigneeId: acmeAgent.id,
      tags: ['billing'],
      resolvedAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
    }
  }));

  acmeTickets.push(await prisma.ticket.create({
    data: {
      tenantId: acmeCorp.id,
      subject: 'Account upgrade completed',
      status: TicketStatus.RESOLVED,
      priority: Priority.NORMAL,
      channel: Channel.EMAIL,
      contactId: acmeContacts[3].id,
      tags: ['billing', 'upgrade'],
      resolvedAt: new Date(Date.now() - 48 * 60 * 60 * 1000)
    }
  }));

  acmeTickets.push(await prisma.ticket.create({
    data: {
      tenantId: acmeCorp.id,
      subject: 'General inquiry',
      status: TicketStatus.CLOSED,
      priority: Priority.LOW,
      channel: Channel.CHAT_WIDGET,
      contactId: acmeContacts[0].id,
      tags: ['general'],
      closedAt: new Date(Date.now() - 72 * 60 * 60 * 1000)
    }
  }));

  // Create Tickets for Beta Inc
  const betaTickets = [];

  betaTickets.push(await prisma.ticket.create({
    data: {
      tenantId: betaInc.id,
      subject: 'App crashes on startup',
      status: TicketStatus.OPEN,
      priority: Priority.URGENT,
      channel: Channel.API,
      contactId: betaContacts[4].id,
      assigneeId: betaAgent.id,
      teamId: betaTeam.id,
      tags: ['technical', 'bug', 'critical'],
      slaDeadline: new Date(Date.now() + 1 * 60 * 60 * 1000)
    }
  }));

  betaTickets.push(await prisma.ticket.create({
    data: {
      tenantId: betaInc.id,
      subject: 'How to export data?',
      status: TicketStatus.OPEN,
      priority: Priority.NORMAL,
      channel: Channel.CHAT_WIDGET,
      contactId: betaContacts[0].id,
      assigneeId: betaAgent.id,
      tags: ['how-to']
    }
  }));

  betaTickets.push(await prisma.ticket.create({
    data: {
      tenantId: betaInc.id,
      subject: 'Discord bot not responding',
      status: TicketStatus.OPEN,
      priority: Priority.HIGH,
      channel: Channel.DISCORD,
      contactId: betaContacts[1].id,
      tags: ['technical', 'discord']
    }
  }));

  betaTickets.push(await prisma.ticket.create({
    data: {
      tenantId: betaInc.id,
      subject: 'Subscription renewal question',
      status: TicketStatus.OPEN,
      priority: Priority.NORMAL,
      channel: Channel.EMAIL,
      contactId: betaContacts[3].id,
      tags: ['billing']
    }
  }));

  betaTickets.push(await prisma.ticket.create({
    data: {
      tenantId: betaInc.id,
      subject: 'Waiting for customer response',
      status: TicketStatus.PENDING,
      priority: Priority.NORMAL,
      channel: Channel.TELEGRAM,
      contactId: betaContacts[2].id,
      assigneeId: betaAgent.id,
      snoozedUntil: new Date(Date.now() + 48 * 60 * 60 * 1000),
      tags: ['pending-customer']
    }
  }));

  betaTickets.push(await prisma.ticket.create({
    data: {
      tenantId: betaInc.id,
      subject: 'Integration setup assistance',
      status: TicketStatus.PENDING,
      priority: Priority.LOW,
      channel: Channel.API,
      contactId: betaContacts[4].id,
      tags: ['integration', 'setup']
    }
  }));

  betaTickets.push(await prisma.ticket.create({
    data: {
      tenantId: betaInc.id,
      subject: 'Password reset completed',
      status: TicketStatus.PENDING,
      priority: Priority.LOW,
      channel: Channel.CHAT_WIDGET,
      contactId: betaContacts[0].id,
      tags: ['account']
    }
  }));

  betaTickets.push(await prisma.ticket.create({
    data: {
      tenantId: betaInc.id,
      subject: 'Bug fix verified',
      status: TicketStatus.RESOLVED,
      priority: Priority.HIGH,
      channel: Channel.DISCORD,
      contactId: betaContacts[1].id,
      assigneeId: betaAgent.id,
      tags: ['bug', 'verified'],
      resolvedAt: new Date(Date.now() - 12 * 60 * 60 * 1000)
    }
  }));

  betaTickets.push(await prisma.ticket.create({
    data: {
      tenantId: betaInc.id,
      subject: 'Feature request acknowledged',
      status: TicketStatus.RESOLVED,
      priority: Priority.LOW,
      channel: Channel.EMAIL,
      contactId: betaContacts[3].id,
      tags: ['enhancement'],
      resolvedAt: new Date(Date.now() - 36 * 60 * 60 * 1000)
    }
  }));

  betaTickets.push(await prisma.ticket.create({
    data: {
      tenantId: betaInc.id,
      subject: 'Trial extension approved',
      status: TicketStatus.CLOSED,
      priority: Priority.NORMAL,
      channel: Channel.CHAT_WIDGET,
      contactId: betaContacts[0].id,
      tags: ['billing', 'trial'],
      closedAt: new Date(Date.now() - 96 * 60 * 60 * 1000)
    }
  }));

  console.log(`Created 20 tickets (10 per tenant)\n`);

  // Create Messages for Acme Corp tickets
  console.log('Creating messages...');
  let messageCount = 0;

  // Ticket 1: Login issue
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[0].id,
      contactId: acmeContacts[0].id,
      direction: MessageDirection.INBOUND,
      contentText: "I can't login to my account. It keeps saying 'Invalid credentials' even though I'm sure my password is correct.",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 60 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[0].id,
      senderId: acmeAgent.id,
      direction: MessageDirection.OUTBOUND,
      contentText: "Hi John, I'm sorry to hear you're having trouble logging in. Let me help you with that. Can you confirm the email address you're trying to use?",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 55 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[0].id,
      contactId: acmeContacts[0].id,
      direction: MessageDirection.INBOUND,
      contentText: "Yes, it's john.smith@example.com",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 50 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[0].id,
      senderId: acmeAgent.id,
      direction: MessageDirection.OUTBOUND,
      contentText: "I've sent a password reset link to that email. Please check your inbox and spam folder.",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 45 * 60 * 1000)
    }
  });
  messageCount += 4;

  // Ticket 2: Billing question
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[1].id,
      contactId: acmeContacts[3].id,
      direction: MessageDirection.INBOUND,
      contentText: "I was charged twice this month for my subscription. Can you please look into this?",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 120 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[1].id,
      senderId: acmeAgent.id,
      direction: MessageDirection.OUTBOUND,
      contentText: "I'm looking into this right away. Can you provide your order ID or the transaction details?",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 115 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[1].id,
      senderId: acmeAgent.id,
      direction: MessageDirection.OUTBOUND,
      contentText: "Escalating to billing team for immediate review.",
      messageType: MessageType.NOTE,
      createdAt: new Date(Date.now() - 110 * 60 * 1000)
    }
  });
  messageCount += 3;

  // Ticket 3: Feature request
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[2].id,
      contactId: acmeContacts[4].id,
      direction: MessageDirection.INBOUND,
      contentText: "Would be great if the API supported webhooks for real-time notifications.",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 200 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[2].id,
      direction: MessageDirection.OUTBOUND,
      contentText: "Thank you for the suggestion! I've forwarded this to our product team.",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 190 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[2].id,
      direction: MessageDirection.OUTBOUND,
      contentText: "Feature request logged in product backlog.",
      messageType: MessageType.SYSTEM,
      createdAt: new Date(Date.now() - 185 * 60 * 1000)
    }
  });
  messageCount += 3;

  // Ticket 4: Discord integration
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[3].id,
      contactId: acmeContacts[1].id,
      direction: MessageDirection.INBOUND,
      contentText: "The Discord bot isn't responding to commands anymore.",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 90 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[3].id,
      senderId: acmeAgent.id,
      direction: MessageDirection.OUTBOUND,
      contentText: "I see the issue. Let me restart the bot service for your server.",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 85 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[3].id,
      senderId: acmeAgent.id,
      direction: MessageDirection.OUTBOUND,
      contentText: "Can you try running a command now?",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 80 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[3].id,
      contactId: acmeContacts[1].id,
      direction: MessageDirection.INBOUND,
      contentText: "It's working now! Thanks!",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 75 * 60 * 1000)
    }
  });
  messageCount += 4;

  // Ticket 5: Setup help
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[4].id,
      contactId: acmeContacts[2].id,
      direction: MessageDirection.INBOUND,
      contentText: "I need help setting up my account. When will someone be available?",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 30 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[4].id,
      direction: MessageDirection.OUTBOUND,
      contentText: "We'll get back to you within 24 hours. Thank you for your patience!",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 25 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: acmeCorp.id,
      ticketId: acmeTickets[4].id,
      direction: MessageDirection.OUTBOUND,
      contentText: "Ticket snoozed until customer is available.",
      messageType: MessageType.NOTE,
      createdAt: new Date(Date.now() - 20 * 60 * 1000)
    }
  });
  messageCount += 3;

  // Messages for Beta Inc tickets (similar pattern)
  await prisma.message.create({
    data: {
      tenantId: betaInc.id,
      ticketId: betaTickets[0].id,
      contactId: betaContacts[4].id,
      direction: MessageDirection.INBOUND,
      contentText: "The mobile app crashes immediately when I try to open it on iOS 17.",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 45 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: betaInc.id,
      ticketId: betaTickets[0].id,
      senderId: betaAgent.id,
      direction: MessageDirection.OUTBOUND,
      contentText: "This is a critical issue. Our dev team is investigating. Can you share your device model and app version?",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 40 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: betaInc.id,
      ticketId: betaTickets[0].id,
      contactId: betaContacts[4].id,
      direction: MessageDirection.INBOUND,
      contentText: "iPhone 14 Pro, app version 2.1.0",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 35 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: betaInc.id,
      ticketId: betaTickets[0].id,
      senderId: betaAgent.id,
      direction: MessageDirection.OUTBOUND,
      contentText: "Engineering team notified - iOS 17 crash on startup.",
      messageType: MessageType.NOTE,
      createdAt: new Date(Date.now() - 30 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: betaInc.id,
      ticketId: betaTickets[0].id,
      direction: MessageDirection.OUTBOUND,
      contentText: "Ticket marked as urgent and assigned to mobile team.",
      messageType: MessageType.SYSTEM,
      createdAt: new Date(Date.now() - 25 * 60 * 1000)
    }
  });
  messageCount += 5;

  await prisma.message.create({
    data: {
      tenantId: betaInc.id,
      ticketId: betaTickets[1].id,
      contactId: betaContacts[0].id,
      direction: MessageDirection.INBOUND,
      contentText: "How do I export my data to CSV?",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 60 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: betaInc.id,
      ticketId: betaTickets[1].id,
      senderId: betaAgent.id,
      direction: MessageDirection.OUTBOUND,
      contentText: "Go to Settings > Data Export > Select CSV format. Click 'Export' and download the file.",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 55 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: betaInc.id,
      ticketId: betaTickets[1].id,
      contactId: betaContacts[0].id,
      direction: MessageDirection.INBOUND,
      contentText: "Perfect! That worked. Thank you!",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 50 * 60 * 1000)
    }
  });
  messageCount += 3;

  await prisma.message.create({
    data: {
      tenantId: betaInc.id,
      ticketId: betaTickets[2].id,
      contactId: betaContacts[1].id,
      direction: MessageDirection.INBOUND,
      contentText: "The Discord bot stopped working in our server.",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 100 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: betaInc.id,
      ticketId: betaTickets[2].id,
      direction: MessageDirection.OUTBOUND,
      contentText: "Checking bot status and permissions...",
      messageType: MessageType.TEXT,
      createdAt: new Date(Date.now() - 95 * 60 * 1000)
    }
  });
  await prisma.message.create({
    data: {
      tenantId: betaInc.id,
      ticketId: betaTickets[2].id,
      direction: MessageDirection.OUTBOUND,
      contentText: "Bot connection verified. Awaiting customer confirmation.",
      messageType: MessageType.NOTE,
      createdAt: new Date(Date.now() - 90 * 60 * 1000)
    }
  });
  messageCount += 3;

  console.log(`Created ${messageCount} messages across all tickets\n`);

  // Create Canned Responses
  console.log('Creating canned responses...');
  await Promise.all([
    // Acme Corp
    prisma.cannedResponse.create({
      data: {
        tenantId: acmeCorp.id,
        title: 'greeting',
        content: "Hi! Thanks for reaching out to Acme Corp support. I'm here to help you today.",
        shortcut: '/greet',
        scope: CannedResponseScope.TENANT
      }
    }),
    prisma.cannedResponse.create({
      data: {
        tenantId: acmeCorp.id,
        title: 'billing-info',
        content: "I'd be happy to help with your billing question. Let me pull up your account details and get back to you shortly.",
        shortcut: '/billing',
        scope: CannedResponseScope.TENANT
      }
    }),
    prisma.cannedResponse.create({
      data: {
        tenantId: acmeCorp.id,
        title: 'escalate',
        content: "I'm escalating this to our senior team who can better assist you. They'll reach out within 24 hours.",
        shortcut: '/escalate',
        scope: CannedResponseScope.TENANT
      }
    }),
    prisma.cannedResponse.create({
      data: {
        tenantId: acmeCorp.id,
        title: 'closing',
        content: "Glad we could help! Is there anything else I can assist you with today?",
        shortcut: '/close',
        scope: CannedResponseScope.TENANT
      }
    }),
    prisma.cannedResponse.create({
      data: {
        tenantId: acmeCorp.id,
        title: 'troubleshoot',
        content: "Could you try the following steps:\n1. Clear your browser cache\n2. Log out and log back in\n3. Try a different browser\n\nLet me know if this resolves the issue!",
        shortcut: '/troubleshoot',
        scope: CannedResponseScope.TENANT
      }
    }),
    // Beta Inc
    prisma.cannedResponse.create({
      data: {
        tenantId: betaInc.id,
        title: 'greeting',
        content: "Hi! Thanks for reaching out to Beta Inc support. I'm here to help you today.",
        shortcut: '/greet',
        scope: CannedResponseScope.TENANT
      }
    }),
    prisma.cannedResponse.create({
      data: {
        tenantId: betaInc.id,
        title: 'billing-info',
        content: "I'd be happy to help with your billing question. Let me pull up your account details and get back to you shortly.",
        shortcut: '/billing',
        scope: CannedResponseScope.TENANT
      }
    }),
    prisma.cannedResponse.create({
      data: {
        tenantId: betaInc.id,
        title: 'escalate',
        content: "I'm escalating this to our senior team who can better assist you. They'll reach out within 24 hours.",
        shortcut: '/escalate',
        scope: CannedResponseScope.TENANT
      }
    }),
    prisma.cannedResponse.create({
      data: {
        tenantId: betaInc.id,
        title: 'closing',
        content: "Glad we could help! Is there anything else I can assist you with today?",
        shortcut: '/close',
        scope: CannedResponseScope.TENANT
      }
    }),
    prisma.cannedResponse.create({
      data: {
        tenantId: betaInc.id,
        title: 'troubleshoot',
        content: "Could you try the following steps:\n1. Clear your browser cache\n2. Log out and log back in\n3. Try a different browser\n\nLet me know if this resolves the issue!",
        shortcut: '/troubleshoot',
        scope: CannedResponseScope.TENANT
      }
    })
  ]);
  console.log(`Created 10 canned responses (5 per tenant)\n`);

  // Create Saved Views
  console.log('Creating saved views...');
  await Promise.all([
    // Acme Corp
    prisma.savedView.create({
      data: {
        tenantId: acmeCorp.id,
        userId: acmeAgent.id,
        name: 'My Urgent',
        filters: {
          priority: ['URGENT', 'HIGH'],
          assigneeId: acmeAgent.id
        },
        sortBy: 'priority',
        sortOrder: 'desc'
      }
    }),
    prisma.savedView.create({
      data: {
        tenantId: acmeCorp.id,
        userId: acmeAgent.id,
        name: 'Unassigned',
        filters: {
          assigneeId: null,
          status: ['OPEN']
        },
        sortBy: 'createdAt',
        sortOrder: 'asc'
      }
    }),
    prisma.savedView.create({
      data: {
        tenantId: acmeCorp.id,
        userId: acmeAgent.id,
        name: 'Discord Tickets',
        filters: {
          channel: ['DISCORD']
        },
        sortBy: 'updatedAt',
        sortOrder: 'desc'
      }
    }),
    // Beta Inc
    prisma.savedView.create({
      data: {
        tenantId: betaInc.id,
        userId: betaAgent.id,
        name: 'My Urgent',
        filters: {
          priority: ['URGENT', 'HIGH'],
          assigneeId: betaAgent.id
        },
        sortBy: 'priority',
        sortOrder: 'desc'
      }
    }),
    prisma.savedView.create({
      data: {
        tenantId: betaInc.id,
        userId: betaAgent.id,
        name: 'Unassigned',
        filters: {
          assigneeId: null,
          status: ['OPEN']
        },
        sortBy: 'createdAt',
        sortOrder: 'asc'
      }
    }),
    prisma.savedView.create({
      data: {
        tenantId: betaInc.id,
        userId: betaAgent.id,
        name: 'Discord Tickets',
        filters: {
          channel: ['DISCORD']
        },
        sortBy: 'updatedAt',
        sortOrder: 'desc'
      }
    })
  ]);
  console.log(`Created 6 saved views (3 per tenant)\n`);

  // Create Macros
  console.log('Creating macros...');
  await Promise.all([
    // Acme Corp
    prisma.macro.create({
      data: {
        tenantId: acmeCorp.id,
        name: 'Escalate to billing',
        description: 'Escalate ticket to billing team',
        actions: [
          { type: 'set_priority', value: 'HIGH' },
          { type: 'add_tag', value: 'billing' },
          { type: 'add_note', value: 'Escalated to billing team' }
        ],
        scope: MacroScope.TENANT
      }
    }),
    prisma.macro.create({
      data: {
        tenantId: acmeCorp.id,
        name: 'Close with thanks',
        description: 'Send thank you message and close ticket',
        actions: [
          { type: 'send_reply', value: 'Thanks for contacting us!' },
          { type: 'set_status', value: 'CLOSED' }
        ],
        scope: MacroScope.TENANT
      }
    }),
    // Beta Inc
    prisma.macro.create({
      data: {
        tenantId: betaInc.id,
        name: 'Escalate to billing',
        description: 'Escalate ticket to billing team',
        actions: [
          { type: 'set_priority', value: 'HIGH' },
          { type: 'add_tag', value: 'billing' },
          { type: 'add_note', value: 'Escalated to billing team' }
        ],
        scope: MacroScope.TENANT
      }
    }),
    prisma.macro.create({
      data: {
        tenantId: betaInc.id,
        name: 'Close with thanks',
        description: 'Send thank you message and close ticket',
        actions: [
          { type: 'send_reply', value: 'Thanks for contacting us!' },
          { type: 'set_status', value: 'CLOSED' }
        ],
        scope: MacroScope.TENANT
      }
    })
  ]);
  console.log(`Created 4 macros (2 per tenant)\n`);

  // Create Automation Rules
  console.log('Creating automation rules...');
  await Promise.all([
    // Acme Corp
    prisma.automationRule.create({
      data: {
        tenantId: acmeCorp.id,
        name: 'Auto-assign urgent',
        conditions: {
          priority: 'URGENT'
        },
        actions: {
          assign: acmeAgent.id
        },
        isActive: true,
        priority: 1
      }
    }),
    prisma.automationRule.create({
      data: {
        tenantId: acmeCorp.id,
        name: 'SLA breach alert',
        conditions: {
          slaBreached: true
        },
        actions: {
          notify: acmeAdmin.id,
          addTag: 'sla-breach'
        },
        isActive: true,
        priority: 2
      }
    }),
    // Beta Inc
    prisma.automationRule.create({
      data: {
        tenantId: betaInc.id,
        name: 'Auto-assign urgent',
        conditions: {
          priority: 'URGENT'
        },
        actions: {
          assign: betaAgent.id
        },
        isActive: true,
        priority: 1
      }
    }),
    prisma.automationRule.create({
      data: {
        tenantId: betaInc.id,
        name: 'SLA breach alert',
        conditions: {
          slaBreached: true
        },
        actions: {
          notify: betaAdmin.id,
          addTag: 'sla-breach'
        },
        isActive: true,
        priority: 2
      }
    })
  ]);
  console.log(`Created 4 automation rules (2 per tenant)\n`);

  // Summary
  console.log('='.repeat(60));
  console.log('DATABASE SEED COMPLETED SUCCESSFULLY');
  console.log('='.repeat(60));
  console.log('\nSummary:');
  console.log(`  Tenants: 2`);
  console.log(`    - Acme Corp (${acmeCorp.slug}, ${acmeCorp.plan})`);
  console.log(`    - Beta Inc (${betaInc.slug}, ${betaInc.plan})`);
  console.log(`\n  Users: 6 (3 per tenant)`);
  console.log(`    - 2 Owners, 2 Admins, 2 Agents`);
  console.log(`\n  Teams: 2 (1 per tenant with agent members)`);
  console.log(`\n  Contacts: 10 (5 per tenant)`);
  console.log(`    - Channels: CHAT_WIDGET, DISCORD, TELEGRAM, EMAIL, API`);
  console.log(`\n  Tickets: 20 (10 per tenant)`);
  console.log(`    - Status: OPEN (8), PENDING (6), RESOLVED (4), CLOSED (2)`);
  console.log(`    - Priority: URGENT (2), HIGH (4), NORMAL (10), LOW (4)`);
  console.log(`    - With SLA deadlines: 2`);
  console.log(`    - Snoozed: 2`);
  console.log(`\n  Messages: ${messageCount}`);
  console.log(`    - Mix of INBOUND, OUTBOUND, NOTE, and SYSTEM messages`);
  console.log(`\n  Canned Responses: 10 (5 per tenant)`);
  console.log(`\n  Saved Views: 6 (3 per tenant)`);
  console.log(`\n  Macros: 4 (2 per tenant)`);
  console.log(`\n  Automation Rules: 4 (2 per tenant)`);
  console.log(`\n  Custom Field Definitions: 6 (3 per tenant)`);
  console.log('\n' + '='.repeat(60));
  console.log('\nTest credentials:');
  console.log('  Email: owner@acme-corp.com (or any user above)');
  console.log('  Password: password123');
  console.log('='.repeat(60));
}

main()
  .catch((error) => {
    console.error('Error seeding database:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
