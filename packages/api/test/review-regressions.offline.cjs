const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(process.env.TICKETHACKER_TYPESCRIPT || 'typescript');
const { fixture, store, config, prepared, options, provider, final, tool, load } = require('./agent-integrity.offline.cjs');
const { WidgetService } = load('widget/widget.service.ts');
const { OpenclawListener } = load('openclaw/openclaw.listener.ts');
const { OpenclawAgentProcessor } = load('openclaw/openclaw-agent.processor.ts');

for (const enabled of [false, true]) test(`widget actual send consumer has one queued authority path; enabled=${enabled}`, async () => {
  const f = fixture(); const settings = f.db.state.tenants[0].settings;
  Object.assign(settings, { openclawWidgetAgent: true, openclawAgentMode: enabled ? 'copilot' : 'off', openclawAutoTriage: false });
  const jobs = []; const listener = new OpenclawListener({ add: async (...args) => jobs.push(args) }, f.db, f.operations);
  const emitted = [];
  const widget = new WidgetService(f.db, {}, { emit: (name, payload) => emitted.push([name, payload]) }, f.service);
  provider([{ role: 'assistant', tool_calls: [tool('escalate', { ticketId: 'ticket-a', reason: 'unapproved widget direct call' })] }, final('escalated')]);
  const message = await widget.sendMessage('tenant-a', 'ticket-a', 'contact-a', 'New customer message');
  assert.equal(f.db.state.ops.length, 0, 'widget must not mint a manual operation');
  assert.equal(emitted.length, 1); assert.equal(emitted[0][0], 'message.created');
  await listener.handleMessageCreated(emitted[0][1]);
  assert.equal(jobs.length, enabled ? 1 : 0);
  assert.equal(f.db.state.tickets[0].metadata.preserve, 'human-value');
  if (enabled) {
    assert.equal(jobs[0][1].originMessageId, message.id); assert.equal(f.db.state.ops[0].source, 'automation');
    provider([{ role: 'assistant', tool_calls: [tool('send_reply', { ticketId: 'ticket-a', content: 'A proposed answer' })] }, final('drafted')]);
    const result = await new OpenclawAgentProcessor(f.service).process({ data: jobs[0][1] });
    assert.equal(result.action, 'drafted'); assert.equal(result.delivery, 'not_sent');
  } else assert.equal(f.db.state.messages.length, 2, 'only the inbound message may be persisted');
});

for (const messageFirst of [true, false]) test(`initial triage handles actual event order: messageFirst=${messageFirst}`, async () => {
  const f = fixture(); f.db.state.tenants[0].settings.openclawAutoSuggest = false;
  const original = f.db.state.messages[0]; if (!messageFirst) f.db.state.messages = [];
  const jobs = []; const listener = new OpenclawListener({ add: async (...args) => jobs.push(args) }, f.db, f.operations);
  await listener.handleTicketCreated({ tenantId: 'tenant-a', ticket: f.db.state.tickets[0] });
  if (!messageFirst) { assert.equal(jobs.length, 0, 'wait for the first message instead of triaging an empty ticket'); f.db.state.messages.push(original); f.db.state.tickets[0].agentVersion++; }
  await listener.handleMessageCreated({ tenantId: 'tenant-a', ticketId: 'ticket-a', message: original });
  const triage = jobs.filter(j => j[0] === 'triage'); assert.ok(triage.length >= 1);
  assert.ok(triage.every(j => j[1].originMessageId === original.id)); assert.equal(new Set(triage.map(j => j[2].jobId)).size, 1);
  assert.equal(f.db.state.ops.length, 1);
  provider([{ role: 'assistant', tool_calls: [tool('set_tags', { ticketId: 'ticket-a', tags: ['triaged'] })] }, final()]);
  assert.equal((await new OpenclawAgentProcessor(f.service).process({ data: triage[0][1] })).action, 'triaged');
  assert.deepEqual(f.db.state.tickets[0].tags, ['triaged']);
});

test('manual retry returns the original completed receipt after a new inbound correction', async () => {
  const f = fixture(); provider([final('drafted', { draftReply: 'First draft' })]);
  const result = await f.service.generateDraftReply('ticket-a', 'tenant-a', { requestId: 'manual-retry' });
  await f.db.message.create({ data: { tenantId: 'tenant-a', ticketId: 'ticket-a', direction: 'INBOUND', messageType: 'TEXT', contentText: 'Correction', createdAt: new Date(1000) } });
  globalThis.fetch = async () => { throw new Error('retry must not call a provider'); };
  assert.deepEqual(await f.service.generateDraftReply('ticket-a', 'tenant-a', { requestId: 'manual-retry' }), result);
  assert.equal(f.db.state.ops[0].originMessageId, 'msg-1');
  await assert.rejects(() => f.operations.prepare({ id: 'manual-retry', ticketId: 'ticket-a', tenantId: 'tenant-a', kind: 'draft', source: 'manual', originMessageId: f.db.state.messages.at(-1).id }), /identity/);
});

// Execute the actual page onSuccess closures; React/network/browser rendering are
// outside this fixture. AST selection avoids recreating toast logic in the test.
const pagePath = process.env.TICKETHACKER_DASHBOARD_PAGE || path.resolve(__dirname, '../../dashboard/src/pages/TicketDetailPage.tsx');
const page = ts.createSourceFile(pagePath, fs.readFileSync(pagePath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function pageCallback(name, env) {
  let arrow;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(page) === name) arrow = node.initializer.arguments[0].properties.find(p => p.name?.getText(page) === 'onSuccess').initializer;
    ts.forEachChild(node, visit);
  }
  visit(page); assert.ok(arrow, `Missing actual ${name} consumer`);
  const compiled = ts.transpileModule(`(${arrow.getText(page)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(compiled, env);
}
let describeAgentResult;
const noticePath = path.resolve(__dirname, '../../dashboard/src/lib/agent-result-notice.ts');
if (fs.existsSync(noticePath)) describeAgentResult = require('./offline-loader.cjs').loader(path.dirname(noticePath))('agent-result-notice.ts').describeAgentResult;
for (const name of ['aiTriageMutation', 'aiReplyMutation', 'aiResolveMutation', 'aiSummarizeMutation']) {
  for (const action of ['superseded', 'uncertain', 'needs_human', 'drafted', 'summarized', 'triaged', 'escalated']) {
    test(`dashboard ${name} reports ${action} truthfully`, () => {
      const notices = []; const inserted = [];
      const fn = pageCallback(name, { id: 'ticket-a', setAiResult() {}, setShowAiPanel() {}, queryClient: { invalidateQueries() {} }, editor: { commands: { setContent: value => inserted.push(value) } }, showToast: (...args) => notices.push(args), describeAgentResult });
      fn({ result: { action, draftReply: 'Do not insert a stopped draft' } });
      const [message, type] = notices[0];
      if (['superseded', 'uncertain', 'needs_human'].includes(action)) {
        assert.equal(type, 'error'); assert.equal(inserted.length, 0);
        if (action === 'superseded') assert.match(message, /not applied/i);
        if (action === 'uncertain') assert.match(message, /reconcil/i);
      } else {
        assert.equal(type, 'success');
        if (action === 'drafted') assert.match(message, /not.*sent|nothing.*sent/i);
        if (action === 'summarized') assert.match(message, /summary/i);
      }
    });
  }
}
