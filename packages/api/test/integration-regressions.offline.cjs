require('./review-regressions.offline.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(process.env.TICKETHACKER_TYPESCRIPT || 'typescript');
const { fixture, provider, final, tool, load } = require('./agent-integrity.offline.cjs');
const { OpenclawListener } = load('openclaw/openclaw.listener.ts');
const { OpenclawAgentProcessor } = load('openclaw/openclaw-agent.processor.ts');

async function initialWorkflow(inboundPresentAtTicket, widget = false, callbackOrder = 'ticket-first') {
  const f = fixture(); Object.assign(f.db.state.tenants[0].settings, { openclawAutoTriage: true, openclawAutoSuggest: true, openclawWidgetAgent: widget });
  const jobs = []; const listener = new OpenclawListener({ add: async (...args) => jobs.push(args) }, f.db, f.operations);
  const processor = new OpenclawAgentProcessor(f.service, listener);
  const message = f.db.state.messages[0]; if (!inboundPresentAtTicket) f.db.state.messages = [];
  const ticketEvent = { tenantId: 'tenant-a', ticket: f.db.state.tickets[0] };
  const messageEvent = { tenantId: 'tenant-a', ticketId: 'ticket-a', message };
  const callbacks = [];
  if (callbackOrder === 'message-first') {
    assert.equal(inboundPresentAtTicket, true, 'message callback needs its persisted inbound row');
    callbacks.push('message.created'); await listener.handleMessageCreated(messageEvent);
    assert.ok(jobs.some(j => j[0] === 'triage'), 'message handler itself must enqueue initial triage');
    callbacks.push('ticket.created'); await listener.handleTicketCreated(ticketEvent);
    assert.deepEqual(callbacks, ['message.created', 'ticket.created']);
  } else {
    assert.equal(callbackOrder, 'ticket-first');
    callbacks.push('ticket.created'); await listener.handleTicketCreated(ticketEvent);
    if (!inboundPresentAtTicket) { f.db.state.messages.push(message); f.db.state.tickets[0].agentVersion++; }
    callbacks.push('message.created'); await listener.handleMessageCreated(messageEvent);
    assert.deepEqual(callbacks, ['ticket.created', 'message.created']);
  }
  const duplicateEvents = async () => {
    for (const event of callbacks) {
      if (event === 'message.created') await listener.handleMessageCreated(messageEvent);
      else await listener.handleTicketCreated(ticketEvent);
    }
  };
  const triage = jobs.find(j => j[0] === 'triage'); assert.ok(triage);
  const model = provider([
    { role: 'assistant', tool_calls: [tool('set_tags', { ticketId: 'ticket-a', tags: ['triaged'] }), tool('add_note', { ticketId: 'ticket-a', content: 'Internal triage note' }, 'note')] }, final(),
    ...(widget ? [{ role: 'assistant', tool_calls: [tool('send_reply', { ticketId: 'ticket-a', content: 'Proposed response' })] }] : []),
    final('drafted', { draftReply: 'Proposed response' }),
  ]);
  return { ...f, jobs, listener, processor, triage, model, ticketEvent, messageEvent, duplicateEvents };
}
const eventScenarios = [
  { inboundPresentAtTicket: true, callbackOrder: 'ticket-first' },
  { inboundPresentAtTicket: false, callbackOrder: 'ticket-first' },
  { inboundPresentAtTicket: true, callbackOrder: 'message-first' },
];
const scenarioName = s => `callbacks=${s.callbackOrder}, inboundPresentAtTicket=${s.inboundPresentAtTicket}`;
for (const scenario of eventScenarios) for (const widget of [true, false]) {
  test(`combined triage+reply: ${scenarioName(scenario)}, widget=${widget}; duplicate events/jobs preserve one draft`, async () => {
    const f = await initialWorkflow(scenario.inboundPresentAtTicket, widget, scenario.callbackOrder);
    await f.duplicateEvents();
    assert.equal(f.triage[1].originMessageId, 'msg-1');
    assert.equal((await f.processor.process({ data: f.triage[1] })).action, 'triaged');
    const reply = f.jobs.find(j => j[0] !== 'triage'); assert.ok(reply, 'reply must follow successful triage');
    assert.equal(reply[1].originMessageId, 'msg-1');
    const parent = structuredClone(f.db.state.ops.find(op => op.id === f.triage[1].operationId));
    const child = f.db.state.ops.find(op => op.id === reply[1].operationId);
    assert.equal(parent.status, 'COMPLETED');
    assert.ok(parent.completedTicketVersion > parent.ticketVersion, 'save the revision after triage writes');
    assert.equal(child.predecessorId, parent.id);
    assert.equal(child.originMessageId, parent.originMessageId);
    assert.equal(child.ticketVersion, parent.completedTicketVersion);
    assert.equal(child.ticketVersion, f.db.state.tickets[0].agentVersion);
    assert.equal(child.settingsVersion, parent.settingsVersion);
    assert.equal((await f.processor.process({ data: reply[1] })).action, 'drafted');
    assert.equal(f.db.state.messages.filter(m => m.messageType === 'AI_SUGGESTION').length, 1);
    const calls = f.model.length;
    await f.duplicateEvents();
    for (const job of [...f.jobs]) await f.processor.process({ data: job[1] });
    assert.equal(f.model.length, calls, 'duplicates must use receipts, not infer again');
    assert.equal(f.db.state.messages.filter(m => m.messageType === 'AI_SUGGESTION').length, 1);
    assert.equal(f.db.state.ops.length, 2);
    assert.deepEqual(f.db.state.ops.find(op => op.id === parent.id), parent, 'duplicates preserve the predecessor receipt');
  });
}

test('queue failure after dependent preparation recovers using both receipts without duplicate inference', async () => {
  const f = await initialWorkflow(true);
  const add = f.listener.queue.add; let fail = true;
  f.listener.queue.add = async (...args) => { if (args[0] !== 'triage' && fail) { fail = false; throw Error('Injected queue failure'); } return add(...args); };
  await assert.rejects(() => f.processor.process({ data: f.triage[1] }), /queue failure/);
  const parent = structuredClone(f.db.state.ops.find(op => op.kind === 'triage'));
  const child = structuredClone(f.db.state.ops.find(op => op.kind === 'draft'));
  assert.equal(parent.status, 'COMPLETED'); assert.equal(child.status, 'PENDING');
  assert.equal((await f.processor.process({ data: f.triage[1] })).action, 'triaged');
  const job = f.jobs.find(j => j[0] !== 'triage'); assert.ok(job);
  assert.equal((await f.processor.process({ data: job[1] })).action, 'drafted');
  assert.equal(f.model.length, 3); assert.equal(f.db.state.ops.length, 2);
  assert.deepEqual(f.db.state.ops.find(op => op.kind === 'triage'), parent);
});

test('a v2 superseded sibling reply receipt is never rebased by dependent preparation', async () => {
  const f = await initialWorkflow(true);
  const { operationId } = load('openclaw/agent-operations.ts');
  const id = operationId('tenant-a', 'ticket-a', 'draft', 'msg-1');
  await f.operations.prepare({ id, tenantId: 'tenant-a', ticketId: 'ticket-a', kind: 'draft', source: 'automation', originMessageId: 'msg-1' });
  const finish = f.operations.finish.bind(f.operations); let oldReceipt;
  f.operations.finish = async (...args) => {
    const result = await finish(...args);
    if (args[0].kind === 'triage') {
      await f.operations.claim(id, 'tenant-a', 'ticket-a', 'draft', 'msg-1', 'automation');
      oldReceipt = structuredClone(f.db.state.ops.find(op => op.id === id));
    }
    return result;
  };
  await f.processor.process({ data: f.triage[1] });
  assert.equal(oldReceipt.status, 'SUPERSEDED');
  const job = f.jobs.find(j => j[0] !== 'triage');
  assert.equal((await f.processor.process({ data: job[1] })).action, 'superseded');
  assert.deepEqual(f.db.state.ops.find(op => op.id === id), oldReceipt);
});

async function change(f, kind) {
  if (kind === 'customer') await f.db.message.create({ data: { tenantId: 'tenant-a', ticketId: 'ticket-a', direction: 'INBOUND', messageType: 'TEXT', contentText: 'Correction after triage', createdAt: new Date(10000) } });
  if (kind === 'human') await f.db.ticket.update({ where: { id: 'ticket-a' }, data: { metadata: { human: 'Changed by agent' } } });
  if (kind === 'settings') { f.db.state.tenants[0].settings.openclawAgentMode = 'off'; f.db.state.tenants[0].updatedAt = new Date(1234); }
}
for (const scenario of eventScenarios) for (const kind of ['customer', 'human', 'settings']) {
  for (const when of ['during-triage', 'after-triage', 'after-prepare']) test(`combined workflow stops ${kind} change ${when}; ${scenarioName(scenario)}`, async () => {
    const f = await initialWorkflow(scenario.inboundPresentAtTicket, false, scenario.callbackOrder);
    const finish = f.operations.finish.bind(f.operations);
    f.operations.finish = async (scope, apply) => {
      if (scope.kind === 'triage' && when === 'during-triage') await change(f, kind);
      const result = await finish(scope, apply);
      if (scope.kind === 'triage' && when === 'after-triage') await change(f, kind);
      return result;
    };
    const result = await f.processor.process({ data: f.triage[1] });
    if (when === 'during-triage') assert.equal(result.action, 'superseded');
    if (when === 'after-prepare') await change(f, kind);
    globalThis.fetch = async () => { throw Error('Intervening changes forbid reply inference'); };
    const replies = f.jobs.filter(j => j[0] !== 'triage');
    if (when !== 'during-triage') assert.ok(replies.length, 'retain a durable stopped continuation');
    for (const job of replies) {
      const child = f.db.state.ops.find(op => op.id === job[1].operationId);
      assert.equal(job[1].originMessageId, 'msg-1', 'a correction cannot replace the original inbound identity');
      assert.equal(child.originMessageId, 'msg-1');
      assert.equal(child.predecessorId, f.triage[1].operationId);
      assert.equal((await f.processor.process({ data: job[1] })).action, 'superseded');
    }
    assert.equal(f.db.state.messages.filter(m => m.messageType === 'AI_SUGGESTION').length, 0);
    assert.ok(f.db.state.ops.some(op => op.status === 'SUPERSEDED'));
    const stopped = structuredClone(f.db.state.ops.filter(op => op.status === 'SUPERSEDED'));
    await f.processor.process({ data: f.triage[1] });
    await f.duplicateEvents();
    for (const job of replies) assert.equal((await f.processor.process({ data: job[1] })).action, 'superseded');
    assert.deepEqual(f.db.state.ops.filter(op => op.status === 'SUPERSEDED'), stopped, 'duplicate must not refresh a stopped revision');
  });
}

// Render the actual component into a tiny element tree, with no browser/API.
const panelPath = process.env.TICKETHACKER_PANEL || path.resolve(__dirname, '../../dashboard/src/components/AiResultPanel.tsx');
function panel(props) {
  const module = { exports: {} };
  const jsx = (type, props, ...children) => ({ type, props: { ...props, children } });
  const source = ts.transpileModule(fs.readFileSync(panelPath, 'utf8'), { fileName: panelPath, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const requireStub = name => {
    if (name === 'react') return { useState: x => [x, () => {}] };
    if (name === 'clsx') return (...args) => args.filter(Boolean).join(' ');
    if (name === '../lib/api') return { aiSubmitFeedback: () => { throw Error('No API effects'); } };
    throw Error(name);
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { React: { createElement: jsx } })(requireStub, module, module.exports);
  return module.exports.default(props);
}
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...elements(tree.props?.children)];
}
function pageUseReply(aiResult, inserted) {
  const file = process.env.TICKETHACKER_DASHBOARD_PAGE || path.resolve(__dirname, '../../dashboard/src/pages/TicketDetailPage.tsx');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let arrow;
  function visit(node) { if (ts.isJsxAttribute(node) && node.name.getText(source) === 'onUseReply') arrow = node.initializer.expression; ts.forEachChild(node, visit); }
  visit(source); assert.ok(arrow);
  return vm.runInNewContext(ts.transpileModule(`(${arrow.getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    { aiResult, editor: { commands: { setContent: text => inserted.push(text), focus() {} } } });
}
for (const action of ['needs_human', 'uncertain', 'superseded', 'triaged', 'summarized', 'escalated', 'drafted']) {
  test(`actual panel affordance and page Use Reply callback require drafted: ${action}`, () => {
    const result = { action, draftReply: 'Retained text', toolCalls: [], confidence: 0.2, summary: 'Review first' };
    const inserted = []; const callback = pageUseReply(result, inserted);
    const buttons = elements(panel({ result, ticketId: 'ticket-a', onUseReply: callback, onDismiss() {} })).filter(e => e.type === 'button' && JSON.stringify(e.props.children).includes('Use Reply'));
    assert.equal(buttons.length, action === 'drafted' ? 1 : 0);
    if (buttons.length) buttons[0].props.onClick();
    callback(result.draftReply); // Exercise the receiving boundary independently.
    assert.equal(inserted.length, action === 'drafted' ? 2 : 0);
  });
}
test('actual resolve needs_human with retained text cannot insert via the page callback', async () => {
  const f = fixture(); provider([final('drafted', { draftReply: 'Retained but unapproved response' })]);
  const result = await f.service.attemptResolve('ticket-a', 'tenant-a');
  assert.equal(result.action, 'needs_human'); assert.ok(result.draftReply);
  const inserted = []; pageUseReply(result, inserted)(result.draftReply);
  assert.deepEqual(inserted, []);
});
