import type { AgentResult } from './api';

export function describeAgentResult(result: AgentResult): { message: string; type: 'success' | 'error' } {
  switch (result.action) {
    case 'drafted': return { message: 'AI draft prepared; nothing was sent', type: 'success' };
    case 'summarized': return { message: 'AI summary generated', type: 'success' };
    case 'triaged': return { message: 'AI triage completed', type: 'success' };
    case 'escalated': return { message: 'Ticket escalated for human review', type: 'success' };
    case 'superseded': return { message: 'AI changes were not applied because the ticket or settings changed', type: 'error' };
    case 'uncertain': return { message: 'AI operation needs reconciliation before another attempt', type: 'error' };
    case 'needs_human': return { message: 'AI could not complete this action; human review is needed', type: 'error' };
    default: return { message: 'AI outcome is unrecognized; review the ticket before retrying', type: 'error' };
  }
}
