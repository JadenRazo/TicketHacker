import { TicketStatus, Priority, Channel } from './enums';

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
}

export interface TicketFilters {
  status?: TicketStatus[];
  priority?: Priority[];
  assigneeId?: string;
  teamId?: string;
  channel?: Channel[];
  tags?: string[];
  search?: string;
  snoozed?: boolean;
}

export interface AiClassification {
  category: string;
  priority: Priority;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  suggestedTeam?: string;
}

export interface WidgetConfig {
  primaryColor: string;
  position: 'bottom-right' | 'bottom-left';
  greeting: string;
  awayMessage: string;
  logo?: string;
  avatar?: string;
  preChatFields: PreChatField[];
}

export interface PreChatField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'select';
  required: boolean;
  options?: string[];
}

export interface SlaConfig {
  firstResponseMinutes: number;
  resolutionMinutes: number;
  businessHoursOnly: boolean;
}

export interface AutoAssignmentConfig {
  strategy: 'round-robin' | 'load-balanced' | 'manual';
  skillBased: boolean;
}

export interface MacroAction {
  action:
    | 'set_status'
    | 'set_priority'
    | 'set_assignee'
    | 'set_team'
    | 'add_tag'
    | 'remove_tag'
    | 'send_reply'
    | 'add_note';
  params: Record<string, any>;
}

export interface AutomationCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt';
  value: any;
}

export interface AutomationAction {
  action: string;
  params: Record<string, any>;
}
