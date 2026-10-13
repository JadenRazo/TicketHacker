const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./offline-loader.cjs');
const load = loader();
const { OpenclawService } = load('openclaw/openclaw.service.ts');
const { AgentOperations, operationId } = load('openclaw/agent-operations.ts');
const { executeToolCall, applyPendingTools, TICKET_TOOLS } = load('openclaw/tools/ticket-tools.ts');
const { ALLOWED_TOOLS, MUTATION_TOOLS } = load('openclaw/action-policy.ts');
const { loadThreadContext } = load('ai/thread-context.ts');
const { AiService } = load('ai/ai.service.ts');
const { AiController } = load('ai/ai.controller.ts');
const { OpenclawAgentProcessor } = load('openclaw/openclaw-agent.processor.ts');
const { OpenclawListener } = load('openclaw/openclaw.listener.ts');
const clone = x => structuredClone(x);
const config = { get: (_key, fallback) => fallback };
// Network fails closed unless an individual test installs a fake provider.
const noNetwork = async () => { throw new Error('Network forbidden in offline tests'); };
globalThis.fetch = noNetwork;

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (value.in) return value.in.includes(row[key]);
      if (value.gte) return row[key] >= value.gte;
      if (value.path) return value.path.reduce((o, k) => o?.[k], row[key]) === value.equals;
    }
    return row[key] === value;
  });
}
function store() {
  let state = {
    tenants: [{ id: 'tenant-a', name: 'Fixture', updatedAt: new Date(0), settings: { openclawEnabled: true,
      openclawAutoTriage: true, openclawAutoSuggest: true, openclawAgentMode: 'copilot', openclawConfidenceThreshold: 0.8 } },
      { id: 'tenant-b', updatedAt: new Date(0), settings: { openclawEnabled: true } }],
    tickets: [{ id: 'ticket-a', tenantId: 'tenant-a', agentVersion: 0, contactId: 'contact-a', channel: 'CHAT_WIDGET',
      subject: 'Refund', status: 'OPEN', priority: 'NORMAL', metadata: { preserve: 'human-value' }, tags: [] },
      { id: 'ticket-other', tenantId: 'tenant-a', agentVersion: 0, contactId: 'contact-other' },
      { id: 'ticket-b', tenantId: 'tenant-b', agentVersion: 0, contactId: 'contact-b' }],
    messages: [{ id: 'msg-1', tenantId: 'tenant-a', ticketId: 'ticket-a', direction: 'INBOUND',
      messageType: 'TEXT', contentText: 'Please help', createdAt: new Date(1), metadata: {} }],
    users: [{ id: 'agent-a', tenantId: 'tenant-a', role: 'AGENT', isActive: true },
      { id: 'agent-b', tenantId: 'tenant-b', role: 'AGENT', isActive: true },
      { id: 'inactive', tenantId: 'tenant-a', role: 'AGENT', isActive: false },
      { id: 'viewer', tenantId: 'tenant-a', role: 'VIEWER', isActive: true }],
    teams: [{ id: 'team-a', tenantId: 'tenant-a' }, { id: 'team-b', tenantId: 'tenant-b' }], ops: [], writes: [],
  };
  let chain = Promise.resolve();
  const db = { get state() { return state; }, guards: true, failAt: null,
    $queryRaw: async (strings) => strings.join('').includes('pg_trigger') ? [{ count: db.guards ? 2n : 0n }] : [],
    async $transaction(fn) {
      const prev = chain; let release; chain = new Promise(r => { release = r; }); await prev;
      const backup = clone(state);
      try { return await fn(db); } catch (e) { state = backup; throw e; } finally { release(); }
    },
  };
  function table(key) {
    return {
      async findMany(q = {}) {
        let rows = state[key].filter(row => matches(row, q.where));
        const order = q.orderBy ? (Array.isArray(q.orderBy) ? q.orderBy : [q.orderBy]) : [];
        rows.sort((a, b) => { for (const item of order) { const [k, direction] = Object.entries(item)[0]; const n = a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0; if (n) return direction === 'desc' ? -n : n; } return 0; });
        if (q.take !== undefined) rows = rows.slice(0, q.take);
        return rows.map(row => {
          const value = clone(row);
          if (key === 'tickets' && q.include?.tenant) value.tenant = clone(state.tenants.find(t => t.id === row.tenantId));
          return value;
        });
      },
      async findFirst(q) { return (await this.findMany(q))[0] ?? null; },
      async findUnique(q) { return this.findFirst(q); },
      async count(q) { return (await this.findMany(q)).length; },
      async create({ data }) {
        if (db.failAt === key) throw new Error('Injected persistence failure');
        if (data.id && state[key].some(row => row.id === data.id)) throw new Error('Unique violation');
        const row = { id: `${key}-${state[key].length}`, createdAt: new Date(100 + state[key].length), ...clone(data) };
        state[key].push(row);
        if (key === 'messages') state.tickets.find(t => t.id === row.ticketId).agentVersion++;
        if (key !== 'ops') state.writes.push({ key, data: clone(data) });
        return clone(row);
      },
      async update({ where, data }) {
        if (db.failAt === key) throw new Error('Injected persistence failure');
        const row = state[key].find(row => matches(row, where));
        if (!row) throw new Error('Record not found');
        Object.assign(row, clone(data));
        if (key === 'tickets') row.agentVersion++;
        if (key !== 'ops') state.writes.push({ key, data: clone(data) });
        return clone(row);
      },
    };
  }
  for (const [name, key] of Object.entries({ tenant: 'tenants', ticket: 'tickets', message: 'messages', user: 'users', team: 'teams', agentOperation: 'ops' })) db[name] = table(key);
  db.customFieldDefinition = { findMany: async () => [] };
  db.cannedResponse = { findMany: async () => [] };
  return db;
}
function fixture(db = store()) {
  const effects = []; const operations = new AgentOperations(db);
  const service = new OpenclawService(config, db, { emit: (...args) => effects.push(args) }, operations);
  return { db, operations, service, effects };
}
function scope(kind = 'triage', tenantId = 'tenant-a', ticketId = 'ticket-a') {
  return { id: 'op', kind, tenantId, ticketId, source: 'manual', originMessageId: 'msg-1', claimToken: 'token', pending: [] };
}
function tool(name, args, id = 'call-1') { return { id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } }; }
const final = (action = 'triaged', extra = {}) => ({ role: 'assistant', content: JSON.stringify({ action, confidence: 0.95, summary: 'Fixture result', ...extra }) });
function provider(messages, before) {
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body); requests.push(request);
    if (before) await before(requests.length, request);
    const message = typeof messages === 'function' ? messages(request) : messages.shift();
    if (!message) throw new Error('Unexpected extra provider call');
    return { ok: true, json: async () => ({ choices: [{ message }] }) };
  };
  return requests;
}
async function prepared(f, kind = 'triage', source = 'automation', id = 'durable-op') {
  return f.operations.prepare({ id, tenantId: 'tenant-a', ticketId: 'ticket-a', kind, source, originMessageId: 'msg-1' });
}
function options(op) { return { operation: { id: op.id, originMessageId: op.originMessageId, source: op.source } }; }

for (const kind of ['draft', 'summary']) for (const name of MUTATION_TOOLS) {
  test(`${kind} rejects ${name} even if provider ignores its tool list`, async () => {
    const f = fixture(); const requests = provider([{ role: 'assistant', tool_calls: [tool(name, { ticketId: 'ticket-b', content: 'send', status: 'RESOLVED' })] }, final(kind === 'draft' ? 'drafted' : 'summarized', { draftReply: 'Refund complete' })]);
    const result = await (kind === 'draft' ? f.service.generateDraftReply('ticket-a', 'tenant-a') : f.service.summarizeTicket('ticket-a', 'tenant-a'));
    assert.deepEqual(requests[0].tools.map(t => t.function.name), TICKET_TOOLS.filter(t => ALLOWED_TOOLS[kind].includes(t.function.name)).map(t => t.function.name));
    assert.equal(result.action, 'needs_human'); assert.deepEqual(f.db.state.writes, []); assert.deepEqual(f.effects, []);
  });
}
for (const [name, args, label] of [
  ['update_ticket', { ticketId: 'ticket-b', priority: 'HIGH' }, 'foreign tenant target'],
  ['update_ticket', { ticketId: 'ticket-other', priority: 'HIGH' }, 'unrelated same tenant target'],
  ['add_note', { ticketId: 'ticket-b', content: 'secret' }, 'foreign message target'],
  ['send_reply', { ticketId: 'ticket-b', content: 'hello' }, 'foreign reply target'],
  ['update_ticket', { ticketId: 'ticket-a', assigneeId: 'agent-b' }, 'foreign assignee'],
  ['update_ticket', { ticketId: 'ticket-a', assigneeId: 'inactive' }, 'inactive assignee'],
  ['update_ticket', { ticketId: 'ticket-a', assigneeId: 'viewer' }, 'viewer assignee'],
  ['assign_to_team', { ticketId: 'ticket-a', teamId: 'team-b' }, 'foreign team'],
  ['set_tags', { ticketId: 'ticket-a', tags: [42] }, 'nonstring tags'],
  ['update_ticket', { ticketId: 'ticket-a', priority: 'INVENTED' }, 'invalid enum'],
  ['add_note', { ticketId: 'ticket-a', content: 'x', tenantId: 'tenant-b' }, 'extra tenant argument'],
  ['get_ticket', {}, 'missing ID'], ['get_ticket', [], 'array arguments'], ['get_ticket', null, 'null arguments'],
  ['search_tickets', { query: 'x', limit: 10000 }, 'unbounded result limit'],
  ['get_contact_history', { contactId: 'contact-b' }, 'foreign contact'],
]) test(`dispatcher rejects ${label}`, async () => {
  const db = store(); const s = scope('resolve'); const result = JSON.parse(await executeToolCall(name, args, s, db, 'call'));
  assert.ok(result.error); assert.equal(s.pending.length, 0); assert.deepEqual(db.state.writes, []);
});

test('dispatcher checks the tenant even when target ID matches the scope', async () => {
  const db = store(); const result = JSON.parse(await executeToolCall('set_tags', { ticketId: 'ticket-b', tags: [] }, scope('triage', 'tenant-a', 'ticket-b'), db, 'call'));
  assert.match(result.error, /not found/); assert.deepEqual(db.state.writes, []);
});

test('authorized triage commits assignment, team, tags and note together; preserves metadata', async () => {
  const f = fixture(); provider([{ role: 'assistant', tool_calls: [
    tool('update_ticket', { ticketId: 'ticket-a', priority: 'HIGH', assigneeId: 'agent-a' }, 'a'),
    tool('assign_to_team', { ticketId: 'ticket-a', teamId: 'team-a' }, 'b'),
    tool('set_tags', { ticketId: 'ticket-a', tags: ['billing'] }, 'c'),
    tool('add_note', { ticketId: 'ticket-a', content: 'Needs billing review' }, 'd'),
  ] }, final()]);
  const result = await f.service.triageTicket('ticket-a', 'tenant-a');
  assert.equal(result.action, 'triaged'); const ticket = f.db.state.tickets[0];
  assert.equal(ticket.assigneeId, 'agent-a'); assert.equal(ticket.teamId, 'team-a'); assert.deepEqual(ticket.tags, ['billing']);
  assert.equal(ticket.metadata.preserve, 'human-value'); assert.equal(f.db.state.messages.at(-1).messageType, 'NOTE');
  assert.equal(f.effects.filter(e => e[0] === 'message.created').length, 0);
});

test('same tool call is staged once and conflicting reuse is rejected', async () => {
  const db = store(); const s = scope(); const args = { ticketId: 'ticket-a', content: 'note' };
  await executeToolCall('add_note', args, s, db, 'a'); await executeToolCall('add_note', args, s, db, 'a');
  assert.equal(s.pending.length, 1);
  assert.ok(JSON.parse(await executeToolCall('add_note', { ...args, content: 'different' }, s, db, 'a')).error);
});

for (const change of ['human-ticket', 'human-message', 'disabled', 'mode-off', 'assignee-disabled']) {
  test(`pending inference respects ${change}`, async () => {
    const f = fixture(); const op = await prepared(f);
    provider([{ role: 'assistant', tool_calls: [tool('update_ticket', { ticketId: 'ticket-a', priority: 'HIGH', assigneeId: 'agent-a' })] }, final()], async n => {
      if (n !== 2) return;
      if (change === 'human-ticket') { f.db.state.tickets[0].priority = 'LOW'; f.db.state.tickets[0].agentVersion++; }
      if (change === 'human-message') await f.db.message.create({ data: { tenantId: 'tenant-a', ticketId: 'ticket-a', direction: 'OUTBOUND', messageType: 'TEXT', contentText: 'Human decision' } });
      if (change === 'disabled') f.db.state.tenants[0].settings.openclawEnabled = false;
      if (change === 'mode-off') f.db.state.tenants[0].settings.openclawAgentMode = 'off';
      if (change === 'assignee-disabled') f.db.state.users[0].isActive = false;
    });
    const result = await f.service.triageTicket('ticket-a', 'tenant-a', options(op));
    assert.equal(result.action, change === 'assignee-disabled' ? 'uncertain' : 'superseded');
    assert.notEqual(f.db.state.tickets[0].priority, 'HIGH'); assert.deepEqual(f.effects, []);
  });
}

test('queued job replay survives new processor/service instances without duplicating note', async () => {
  const f = fixture(); const op = await prepared(f); provider([{ role: 'assistant', tool_calls: [tool('add_note', { ticketId: 'ticket-a', content: 'once' })] }, final()]);
  const job = { data: { action: 'triage', ticketId: 'ticket-a', tenantId: 'tenant-a', operationId: op.id, originMessageId: op.originMessageId } };
  const result = await new OpenclawAgentProcessor(f.service).process(job);
  globalThis.fetch = noNetwork;
  const replay = await new OpenclawAgentProcessor(fixture(f.db).service).process(job);
  assert.deepEqual(replay, result); assert.equal(f.db.state.messages.length, 2);
});

test('stale queued job is superseded before inference', async () => {
  const f = fixture(); const op = await prepared(f); f.db.state.tickets[0].agentVersion++; globalThis.fetch = noNetwork;
  const result = await f.service.triageTicket('ticket-a', 'tenant-a', options(op)); assert.equal(result.action, 'superseded');
});

test('interrupted claimed job is uncertain and not replayed', async () => {
  const f = fixture(); const op = await prepared(f); await f.operations.claim(op.id, 'tenant-a', 'ticket-a', 'triage', 'msg-1', 'automation');
  globalThis.fetch = noNetwork; const result = await fixture(f.db).service.triageTicket('ticket-a', 'tenant-a', options(op));
  assert.equal(result.action, 'uncertain'); assert.deepEqual(f.db.state.writes, []);
});

test('atomic finish rolls back earlier writes on a later persistence failure', async () => {
  const f = fixture(); const op = await prepared(f); f.db.failAt = 'messages';
  provider([{ role: 'assistant', tool_calls: [tool('update_ticket', { ticketId: 'ticket-a', priority: 'HIGH' }, 'a'), tool('add_note', { ticketId: 'ticket-a', content: 'fail' }, 'b')] }, final()]);
  const result = await f.service.triageTicket('ticket-a', 'tenant-a', options(op));
  assert.equal(result.action, 'uncertain'); assert.equal(f.db.state.tickets[0].priority, 'NORMAL'); assert.deepEqual(f.db.state.writes, []); assert.deepEqual(f.effects, []);
});

test('duplicate concurrent claims admit only one executor', async () => {
  const f = fixture(); const op = await prepared(f);
  const results = await Promise.all([1, 2].map(() => f.operations.claim(op.id, 'tenant-a', 'ticket-a', 'triage', 'msg-1', 'automation')));
  assert.equal(results.filter(r => r.scope).length, 1); assert.equal(results.filter(r => r.result?.action === 'uncertain').length, 1);
});

test('lost acknowledgement after commit replays the stored receipt only', async () => {
  const f = fixture(); const op = await prepared(f); const original = f.operations.finish.bind(f.operations);
  f.operations.finish = async (...args) => { await original(...args); throw new Error('lost acknowledgement'); };
  provider([{ role: 'assistant', tool_calls: [tool('add_note', { ticketId: 'ticket-a', content: 'once' })] }, final()]);
  assert.equal((await f.service.triageTicket('ticket-a', 'tenant-a', options(op))).action, 'uncertain');
  globalThis.fetch = noNetwork;
  assert.equal((await fixture(f.db).service.triageTicket('ticket-a', 'tenant-a', options(op))).action, 'triaged');
  assert.equal(f.db.state.messages.length, 2);
});

for (const mismatch of ['tenant', 'ticket', 'origin', 'kind']) test(`callback rejects forged ${mismatch}`, async () => {
  const f = fixture(); const op = await prepared(f, 'triage', 'callback');
  const identity = { operationId: op.id, eventId: 'event-1', kind: 'triage', originMessageId: 'msg-1' };
  if (mismatch === 'origin') identity.originMessageId = 'forged'; if (mismatch === 'kind') identity.kind = 'resolve';
  await assert.rejects(() => f.service.processWebhookEvent('agent.escalated', mismatch === 'ticket' ? 'ticket-other' : 'ticket-a', mismatch === 'tenant' ? 'tenant-b' : 'tenant-a', { reason: 'check' }, identity));
  assert.deepEqual(f.db.state.writes, []);
});

test('callbacks use dispatcher, preserve metadata, and cannot duplicate committed escalation', async () => {
  const f = fixture(); const op = await prepared(f, 'triage', 'callback'); const identity = { operationId: op.id, eventId: 'event-1', kind: 'triage', originMessageId: 'msg-1' };
  const result = await f.service.processWebhookEvent('agent.escalated', 'ticket-a', 'tenant-a', { reason: 'Human requested' }, identity);
  assert.equal(result.action, 'escalated'); assert.equal(f.db.state.tickets[0].metadata.preserve, 'human-value');
  assert.deepEqual(await fixture(f.db).service.processWebhookEvent('agent.escalated', 'ticket-a', 'tenant-a', { reason: 'Human requested' }, identity), result);
  assert.equal(f.db.state.messages.length, 2);
});

for (const kind of ['draft', 'summary']) test(`${kind} callback cannot apply tags`, async () => {
  const f = fixture(); const op = await prepared(f, kind, 'callback');
  const result = await f.service.processWebhookEvent('agent.completed', 'ticket-a', 'tenant-a', { tags: ['forged'], result: { action: 'drafted', summary: 'done', confidence: 1, draftReply: 'hello' } }, { operationId: op.id, eventId: 'e', kind, originMessageId: 'msg-1' });
  assert.equal(result.action, 'needs_human'); assert.deepEqual(f.db.state.writes, []);
});

test('external reply callback is unverified and never becomes a delivered TEXT', async () => {
  const f = fixture(); const op = await prepared(f, 'resolve', 'callback');
  const result = await f.service.processWebhookEvent('agent.reply_sent', 'ticket-a', 'tenant-a', { content: 'Refund complete' }, { operationId: op.id, eventId: 'e', kind: 'resolve', originMessageId: 'msg-1' });
  assert.equal(result.action, 'uncertain'); assert.equal(f.db.state.messages.length, 1); assert.deepEqual(f.effects, []);
});

test('send_reply returns an unsent draft and never reports replied/resolved', async () => {
  const f = fixture(); provider([{ role: 'assistant', tool_calls: [tool('send_reply', { ticketId: 'ticket-a', content: 'Proposed solution' })] }, final('drafted')]);
  const result = await f.service.attemptResolve('ticket-a', 'tenant-a'); assert.equal(result.action, 'drafted');
  assert.equal(result.delivery, 'not_sent'); assert.equal(f.db.state.messages.at(-1).messageType, 'AI_SUGGESTION'); assert.equal(f.db.state.tickets[0].status, 'OPEN'); assert.deepEqual(f.effects, []);
});

test('migration absent fails closed before inference or business writes', async () => {
  const f = fixture(); f.db.guards = false; globalThis.fetch = noNetwork;
  await assert.rejects(() => f.service.triageTicket('ticket-a', 'tenant-a'), /migration/); assert.deepEqual(f.db.state.writes, []);
});

function longThread(db) {
  db.state.messages = Array.from({ length: 75 }, (_, i) => ({ id: `m-${String(i + 1).padStart(3, '0')}`, ticketId: 'ticket-a', tenantId: 'tenant-a', direction: 'OUTBOUND', messageType: 'NOTE', contentText: 'Internal history', createdAt: new Date(i + 1), metadata: {} }));
  Object.assign(db.state.messages[0], { direction: 'INBOUND', messageType: 'TEXT', contentText: 'Initial request' });
  Object.assign(db.state.messages[24], { direction: 'INBOUND', messageType: 'TEXT', contentText: 'Correction: do not refund. Change the delivery address.' });
  Object.assign(db.state.messages[74], { messageType: 'AI_SUGGESTION', contentText: 'Your refund has been completed.' });
}

test('bounded context retains correction after message 20, IDs/types and opening history', async () => {
  const db = store(); longThread(db); const context = await loadThreadContext(db, 'tenant-a', 'ticket-a');
  assert.equal(context.latestRequestId, 'm-025'); assert.ok(context.messages.some(m => m.id === 'm-001'));
  assert.equal(context.messages.find(m => m.id === 'm-075').evidence, 'unsent_draft');
  assert.equal(context.messages.find(m => m.id === 'm-075').delivery, 'not_sent');
  assert.ok(context.messages.length <= 28); assert.equal(context.omittedMessages, 75 - context.messages.length);
  assert.ok(context.messages.some(m => m.id === 'm-025' && m.contentText.includes('do not refund')));
  assert.equal((await loadThreadContext(db, 'tenant-b', 'ticket-a')).messages.length, 0);
});

test('ordinary suggestions and summaries pass typed context through the actual controller/provider seam', async () => {
  const f = fixture(); longThread(f.db); const ai = new AiService(config);
  const controller = new AiController(ai, { logInteraction: async () => {} }, f.db);
  const bodies = provider(request => {
    const context = JSON.parse(request.messages[1].content);
    assert.equal(context.latestRequestId, 'm-025'); assert.equal(context.messages.at(-1).evidence, 'unsent_draft');
    const summary = request.messages[0].content.includes('Summarize');
    return { content: JSON.stringify(summary ? { issue: 'Change delivery address', stepsTaken: [], actionItems: ['Update address'], currentStatus: 'Refund draft is unsent' } : [{ tone: 'Professional', content: 'I can help update the address.' }]) };
  });
  const summary = await controller.summarizeThread('ticket-a', { tenantId: 'tenant-a' });
  const suggestions = await controller.suggestReplies('ticket-a', { tenantId: 'tenant-a' });
  assert.deepEqual(summary.summary.stepsTaken, []); assert.match(suggestions.suggestions[0].content, /address/); assert.equal(bodies.length, 2);
});

test('get_ticket supplies bounded typed context in the real tool loop', async () => {
  const f = fixture(); longThread(f.db); let step = 0;
  provider(request => {
    if (step++ === 0) return { role: 'assistant', tool_calls: [tool('get_ticket', { ticketId: 'ticket-a' })] };
    const evidence = JSON.parse(request.messages.at(-1).content).context;
    assert.equal(evidence.latestRequestId, 'm-025'); assert.equal(evidence.messages.at(-1).evidence, 'unsent_draft');
    return final('drafted', { summary: 'Address correction needs action; refund is an unsent suggestion', draftReply: 'Let us update your address.' });
  });
  const result = await f.service.generateDraftReply('ticket-a', 'tenant-a'); assert.equal(result.action, 'drafted'); assert.match(result.summary, /Unsent/); assert.deepEqual(f.db.state.writes, []);
});

test('context bounds very large messages and marks truncation', async () => {
  const db = store(); longThread(db); db.state.messages.forEach(m => m.contentText = 'x'.repeat(100000));
  const context = await loadThreadContext(db, 'tenant-a', 'ticket-a'); assert.ok(JSON.stringify(context).length < 65000); assert.ok(context.messages.every(m => m.truncated));
});

test('listener duplicates carry the same durable identity and actual inbound message ID', async () => {
  const f = fixture(); f.db.state.tenants[0].settings.openclawAutoTriage = false; const jobs = []; const listener = new OpenclawListener({ add: async (...args) => jobs.push(args) }, f.db, f.operations);
  const payload = { tenantId: 'tenant-a', ticketId: 'ticket-a', message: f.db.state.messages[0] };
  await listener.handleMessageCreated(payload); await listener.handleMessageCreated(payload);
  assert.equal(f.db.state.ops.length, 1); assert.equal(jobs.length, 2); assert.equal(jobs[0][1].originMessageId, 'msg-1');
  assert.equal(jobs[0][2].jobId, jobs[1][2].jobId); assert.equal(jobs[0][2].jobId, operationId('tenant-a', 'ticket-a', 'draft', 'msg-1'));
});

test('draft has the latest correction even if the provider never requests a tool', async () => {
  const f = fixture(); longThread(f.db);
  provider(request => {
    assert.match(request.messages[1].content, /Correction: do not refund/);
    assert.match(request.messages[1].content, /unsent_draft/);
    return final('drafted', { draftReply: 'I can help change your delivery address.' });
  });
  assert.equal((await f.service.generateDraftReply('ticket-a', 'tenant-a')).action, 'drafted');
});

test('malformed tool JSON and unsupported completion do not apply any staged writes', async () => {
  const f = fixture(); provider([{ role: 'assistant', tool_calls: [tool('add_note', { ticketId: 'ticket-a', content: 'proposed' }, 'a'), tool('update_ticket', '{not-json', 'b')] }, final()]);
  const result = await f.service.triageTicket('ticket-a', 'tenant-a'); assert.equal(result.action, 'needs_human'); assert.deepEqual(f.db.state.writes, []);
});

test('missing provider completion discards all staged effects', async () => {
  const f = fixture(); provider([{ role: 'assistant', tool_calls: [tool('add_note', { ticketId: 'ticket-a', content: 'proposed' })] }]);
  const result = await f.service.triageTicket('ticket-a', 'tenant-a'); assert.equal(result.action, 'needs_human'); assert.deepEqual(f.db.state.writes, []);
});

test('copilot saves one unsent draft across job replay without public message events', async () => {
  const f = fixture(); const op = await prepared(f, 'draft'); provider([final('drafted', { draftReply: 'Proposed reply' })]);
  await f.service.generateDraftReply('ticket-a', 'tenant-a', options(op)); globalThis.fetch = noNetwork;
  await fixture(f.db).service.generateDraftReply('ticket-a', 'tenant-a', options(op));
  assert.equal(f.db.state.messages.length, 2); assert.equal(f.db.state.messages[1].metadata.operationId, op.id); assert.deepEqual(f.effects, []);
});

test('manual request identity is idempotent', async () => {
  const f = fixture(); provider([{ role: 'assistant', tool_calls: [tool('add_note', { ticketId: 'ticket-a', content: 'once' })] }, final()]);
  const result = await f.service.triageTicket('ticket-a', 'tenant-a', { requestId: 'manual-request' });
  globalThis.fetch = noNetwork;
  assert.deepEqual(await f.service.triageTicket('ticket-a', 'tenant-a', { requestId: 'manual-request' }), result); assert.equal(f.db.state.messages.length, 2);
});

for (const changed of ['ticket', 'settings']) test(`delayed callback preserves newer ${changed}`, async () => {
  const f = fixture(); const op = await prepared(f, 'triage', 'callback');
  if (changed === 'ticket') { f.db.state.tickets[0].agentVersion++; f.db.state.tickets[0].status = 'CLOSED'; }
  else f.db.state.tenants[0].settings.openclawEnabled = false;
  const result = await f.service.processWebhookEvent('agent.escalated', 'ticket-a', 'tenant-a', { reason: 'delayed' }, { operationId: op.id, eventId: 'e', kind: 'triage', originMessageId: 'msg-1' });
  assert.equal(result.action, 'superseded'); assert.deepEqual(f.db.state.writes, []);
});

test('callback event identity is persisted and rejects a different terminal event', async () => {
  const f = fixture(); const op = await prepared(f, 'triage', 'callback');
  await f.service.processWebhookEvent('agent.failed', 'ticket-a', 'tenant-a', {}, { operationId: op.id, eventId: 'first', kind: 'triage', originMessageId: 'msg-1' });
  assert.equal(f.db.state.ops[0].callbackEventId, 'first');
  await assert.rejects(() => f.service.processWebhookEvent('agent.escalated', 'ticket-a', 'tenant-a', { reason: 'second' }, { operationId: op.id, eventId: 'second', kind: 'triage', originMessageId: 'msg-1' }), /event identity/);
  assert.deepEqual(f.db.state.writes, []);
});

test('queued summarization retains types and current request', async () => {
  const { AiTaskProcessor } = load('message-bus/queues/ai-task.processor.ts'); const db = store(); longThread(db);
  let observed;
  await new AiTaskProcessor({ summarizeThread: async context => { observed = context; } }, db).process({ data: { action: 'summarize', tenantId: 'tenant-a', ticketId: 'ticket-a' } });
  assert.equal(observed.latestRequestId, 'm-025'); assert.equal(observed.messages.at(-1).messageType, 'AI_SUGGESTION');
});

test('widget polling hides drafts, internal notes and system events', async () => {
  const { WidgetService } = load('widget/widget.service.ts'); const db = store(); longThread(db);
  const visible = await new WidgetService(db, {}, {}, {}).getMessages('tenant-a', 'ticket-a');
  assert.equal(visible.length, 2); assert.ok(visible.every(m => m.messageType === 'TEXT'));
});

for (const changed of ['ticket', 'settings', 'none']) test(`classification conditional commit: ${changed}`, async () => {
  const { applyClassificationIfCurrent } = load('ai/state-guard.ts'); const db = store(); const before = clone(db.state.tenants[0].settings);
  if (changed === 'ticket') { db.state.tickets[0].agentVersion++; db.state.tickets[0].priority = 'LOW'; }
  if (changed === 'settings') db.state.tenants[0].settings.aiEnabled = false;
  const applied = await applyClassificationIfCurrent(db, 'tenant-a', 'ticket-a', 0, before, { category: 'billing' }, 'HIGH');
  assert.equal(applied, changed === 'none'); assert.equal(db.state.tickets[0].metadata.preserve, 'human-value');
  if (!applied) assert.deepEqual(db.state.writes, []);
});

test('classifier provider receives correction and draft evidence, and rejects an invalid priority', async () => {
  const db = store(); longThread(db); const ai = new AiService(config);
  provider(request => {
    assert.match(request.messages[1].content, /Correction: do not refund/); assert.match(request.messages[1].content, /unsent_draft/);
    return { content: JSON.stringify({ suggestedPriority: 'UNTRUSTED', confidence: 1 }) };
  });
  assert.equal(await ai.classifyTicket({ subject: 'refund', firstMessage: 'old', context: await loadThreadContext(db, 'tenant-a', 'ticket-a') }), null);
});

test('tenant model configuration remains in use', async () => {
  const f = fixture(); f.db.state.tenants[0].settings.openclawModel = 'fixture-local-model';
  const requests = provider([final('drafted', { draftReply: 'Proposed response' })]);
  await f.service.generateDraftReply('ticket-a', 'tenant-a'); assert.equal(requests[0].model, 'fixture-local-model');
});

test('terminal ticket status is refused when the proposed solution is unsent', async () => {
  const f = fixture(); provider([{ role: 'assistant', tool_calls: [tool('send_reply', { ticketId: 'ticket-a', content: 'Solution' }, 'a'), tool('update_ticket', { ticketId: 'ticket-a', status: 'RESOLVED' }, 'b')] }, final('drafted')]);
  const result = await f.service.attemptResolve('ticket-a', 'tenant-a'); assert.equal(result.action, 'needs_human'); assert.equal(f.db.state.tickets[0].status, 'OPEN'); assert.deepEqual(f.db.state.writes, []);
});

test('forged callback completion cannot mark an unsent reply resolved', async () => {
  const f = fixture(); const op = await prepared(f, 'resolve', 'callback');
  const result = await f.service.processWebhookEvent('agent.completed', 'ticket-a', 'tenant-a', { result: { action: 'resolved', summary: 'Refund completed', confidence: 1 } }, { operationId: op.id, eventId: 'e', kind: 'resolve', originMessageId: 'msg-1' });
  assert.equal(result.action, 'needs_human'); assert.deepEqual(f.db.state.writes, []);
});

test('low-confidence autonomous suggestion has no effect', async () => {
  const f = fixture(); provider([{ role: 'assistant', tool_calls: [tool('send_reply', { ticketId: 'ticket-a', content: 'Uncertain solution' })] }, final('drafted', { confidence: 0.2 })]);
  const result = await f.service.attemptResolve('ticket-a', 'tenant-a'); assert.equal(result.action, 'needs_human'); assert.deepEqual(f.db.state.writes, []);
});

test('get_ticket does not expose corrupt cross-tenant related records', async () => {
  const db = store(); Object.assign(db.state.tickets[0], { contact: { id: 'contact-b', tenantId: 'tenant-b', email: 'private' }, assignee: { id: 'agent-b', tenantId: 'tenant-b' }, team: { id: 'team-b', tenantId: 'tenant-b' } });
  const result = JSON.parse(await executeToolCall('get_ticket', { ticketId: 'ticket-a' }, scope('draft'), db, 'read'));
  assert.equal(result.contact, null); assert.equal(result.assignee, null); assert.equal(result.team, null);
});

test('HTTP draft rejection has no ticket/message writes, including activity logging', async () => {
  const { OpenclawController } = load('openclaw/openclaw.controller.ts'); const f = fixture();
  provider([{ role: 'assistant', tool_calls: [tool('update_ticket', { ticketId: 'ticket-b', priority: 'HIGH' })] }, final('drafted', { draftReply: 'Unapproved reply' })]);
  const response = await new OpenclawController(f.service, f.db, config).draftReply('ticket-a', {}, { tenantId: 'tenant-a' });
  assert.equal(response.result.action, 'needs_human'); assert.deepEqual(f.db.state.writes, []); assert.deepEqual(f.effects, []);
});

module.exports = { fixture, store, config, prepared, options, provider, final, tool, load };
