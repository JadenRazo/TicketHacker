import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { Channel, MessageDirection, MessageType } from '@prisma/client';

@Injectable()
export class DiscordService implements OnModuleInit {
  private readonly logger = new Logger(DiscordService.name);
  private client: Client;
  private isReady = false;

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private config: ConfigService,
  ) {}

  async onModuleInit() {
    const botToken = this.config.get<string>('DISCORD_BOT_TOKEN');
    if (!botToken) {
      this.logger.warn('DISCORD_BOT_TOKEN not found, Discord bot will not start');
      return;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });

    this.client.on('ready', () => {
      this.isReady = true;
      this.logger.log(`Discord bot ready as ${this.client.user?.tag}`);
    });

    this.client.on('interactionCreate', async (interaction) => {
      try {
        if (interaction.isButton()) {
          await this.handleTicketButton(interaction);
        } else if (interaction.isModalSubmit()) {
          await this.handleModalSubmit(interaction);
        }
      } catch (error) {
        this.logger.error('Error handling interaction:', error);
      }
    });

    this.client.on('messageCreate', async (message) => {
      try {
        if (message.author.bot) return;
        if (message.channel.type === ChannelType.PublicThread || message.channel.type === ChannelType.PrivateThread) {
          await this.handleThreadMessage(message);
        }
      } catch (error) {
        this.logger.error('Error handling thread message:', error);
      }
    });

    try {
      await this.client.login(botToken);
    } catch (error) {
      this.logger.error('Failed to login Discord bot:', error);
    }
  }

  async createSupportPanel(guildId: string, channelId: string, tenantId: string) {
    if (!this.isReady) {
      throw new Error('Discord bot is not ready');
    }

    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (!channel || !channel.isTextBased()) {
      throw new Error('Invalid channel');
    }

    const embed = new EmbedBuilder()
      .setTitle('Support Ticket System')
      .setDescription('Click the button below to create a support ticket. Our team will respond as soon as possible.')
      .setColor(0x5865F2);

    const button = new ButtonBuilder()
      .setCustomId(`create_ticket:${tenantId}`)
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await channel.send({
      embeds: [embed],
      components: [row],
    });

    return { success: true, message: 'Support panel created successfully' };
  }

  async handleTicketButton(interaction: any) {
    const [, tenantId] = interaction.customId.split(':');

    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal:${tenantId}`)
      .setTitle('Create Support Ticket');

    const subjectInput = new TextInputBuilder()
      .setCustomId('subject')
      .setLabel('Subject')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Brief description of your issue')
      .setRequired(true)
      .setMaxLength(200);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Please provide details about your issue')
      .setRequired(true)
      .setMaxLength(2000);

    const subjectRow = new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput);
    const descriptionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);

    modal.addComponents(subjectRow, descriptionRow);

    await interaction.showModal(modal);
  }

  async handleModalSubmit(interaction: any) {
    try {
      const [, tenantId] = interaction.customId.split(':');
      const subject = interaction.fields.getTextInputValue('subject');
      const description = interaction.fields.getTextInputValue('description');

      await interaction.deferReply({ ephemeral: true });

      const contact = await this.prisma.contact.upsert({
        where: {
          tenantId_channel_externalId: {
            tenantId,
            channel: Channel.DISCORD,
            externalId: interaction.user.id,
          },
        },
        update: {
          name: interaction.user.username,
          avatarUrl: interaction.user.displayAvatarURL(),
        },
        create: {
          tenantId,
          externalId: interaction.user.id,
          name: interaction.user.username,
          avatarUrl: interaction.user.displayAvatarURL(),
          channel: Channel.DISCORD,
        },
      });

      const thread = await interaction.channel.threads.create({
        name: `${subject.slice(0, 80)} - ${interaction.user.username}`,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        type: ChannelType.PrivateThread,
        reason: `Support ticket created by ${interaction.user.username}`,
      });

      await thread.members.add(interaction.user.id);

      const ticket = await this.prisma.ticket.create({
        data: {
          tenantId,
          subject,
          channel: Channel.DISCORD,
          contactId: contact.id,
          metadata: {
            threadId: thread.id,
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
          },
        },
      });

      const message = await this.prisma.message.create({
        data: {
          tenantId,
          ticketId: ticket.id,
          contactId: contact.id,
          direction: MessageDirection.INBOUND,
          contentText: description,
          messageType: MessageType.TEXT,
        },
      });

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`Ticket #${ticket.id.slice(0, 8)}`)
        .setDescription(description)
        .addFields(
          { name: 'Subject', value: subject },
          { name: 'Status', value: 'Open', inline: true },
          { name: 'Created By', value: interaction.user.username, inline: true },
        )
        .setColor(0x00FF00)
        .setTimestamp();

      await thread.send({ embeds: [welcomeEmbed] });

      this.eventEmitter.emit('ticket.created', { tenantId, ticket });
      this.eventEmitter.emit('message.created', { tenantId, message, ticketId: ticket.id });

      await interaction.editReply({
        content: `Ticket created successfully! Please check <#${thread.id}>`,
      });
    } catch (error) {
      this.logger.error('Error creating ticket from modal:', error);
      await interaction.editReply({
        content: 'An error occurred while creating your ticket. Please try again later.',
      });
    }
  }

  async handleThreadMessage(message: any) {
    try {
      const ticket = await this.prisma.ticket.findFirst({
        where: {
          channel: Channel.DISCORD,
          metadata: {
            path: ['threadId'],
            equals: message.channel.id,
          },
        },
        include: {
          contact: true,
        },
      });

      if (!ticket) return;

      const existingMessage = await this.prisma.message.findFirst({
        where: {
          externalId: message.id,
        },
      });

      if (existingMessage) return;

      const contact = await this.prisma.contact.findUnique({
        where: { id: ticket.contactId },
      });

      if (!contact) return;

      const isFromContact = message.author.id === contact.externalId;

      await this.prisma.message.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: ticket.id,
          contactId: isFromContact ? contact.id : null,
          direction: isFromContact ? MessageDirection.INBOUND : MessageDirection.OUTBOUND,
          contentText: message.content,
          messageType: MessageType.TEXT,
          externalId: message.id,
        },
      });

      this.eventEmitter.emit('message.created', {
        tenantId: ticket.tenantId,
        ticketId: ticket.id,
      });
    } catch (error) {
      this.logger.error('Error handling thread message:', error);
    }
  }

  async sendOutbound(ticketId: string, content: string) {
    try {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
      });

      if (!ticket || ticket.channel !== Channel.DISCORD) {
        throw new Error('Invalid ticket or channel');
      }

      const metadata = ticket.metadata as any;
      const threadId = metadata?.threadId;

      if (!threadId) {
        throw new Error('Thread ID not found in ticket metadata');
      }

      const thread = await this.client.channels.fetch(threadId);

      if (!thread || !thread.isThread()) {
        throw new Error('Thread not found');
      }

      const sentMessage = await thread.send(content);

      await this.prisma.message.updateMany({
        where: {
          ticketId,
          contentText: content,
          direction: MessageDirection.OUTBOUND,
          externalId: null,
        },
        data: {
          externalId: sentMessage.id,
        },
      });

      return { success: true, messageId: sentMessage.id };
    } catch (error) {
      this.logger.error('Error sending outbound message:', error);
      throw error;
    }
  }

  async archiveThread(ticketId: string) {
    try {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
      });

      if (!ticket || ticket.channel !== Channel.DISCORD) {
        return;
      }

      const metadata = ticket.metadata as any;
      const threadId = metadata?.threadId;

      if (!threadId) {
        return;
      }

      const thread = await this.client.channels.fetch(threadId);

      if (thread && thread.isThread()) {
        await thread.setArchived(true, 'Ticket resolved');
        this.logger.log(`Archived thread ${threadId} for ticket ${ticketId}`);
      }
    } catch (error) {
      this.logger.error('Error archiving thread:', error);
    }
  }

  getStatus() {
    return {
      online: this.isReady,
      username: this.client.user?.tag || null,
      guilds: this.client.guilds.cache.size,
    };
  }
}
