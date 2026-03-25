export enum TicketStatus {
  OPEN = 'OPEN',
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum Priority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum Channel {
  CHAT_WIDGET = 'CHAT_WIDGET',
  DISCORD = 'DISCORD',
  TELEGRAM = 'TELEGRAM',
  EMAIL = 'EMAIL',
  API = 'API',
}

export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  AGENT = 'AGENT',
  VIEWER = 'VIEWER',
}

export enum MessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum MessageType {
  TEXT = 'TEXT',
  NOTE = 'NOTE',
  SYSTEM = 'SYSTEM',
  AI_SUGGESTION = 'AI_SUGGESTION',
}

export enum Plan {
  FREE = 'FREE',
  GROWTH = 'GROWTH',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export enum CannedResponseScope {
  PERSONAL = 'PERSONAL',
  TEAM = 'TEAM',
  TENANT = 'TENANT',
}

export enum MacroScope {
  PERSONAL = 'PERSONAL',
  TEAM = 'TEAM',
  TENANT = 'TENANT',
}

export enum CustomFieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  DROPDOWN = 'DROPDOWN',
  DATE = 'DATE',
  BOOLEAN = 'BOOLEAN',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}
