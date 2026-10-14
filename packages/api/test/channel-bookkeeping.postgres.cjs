const { context, waiting } = require('./agent-integrity.postgres.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { adapter } = require('./pg-adapter.cjs');
const { loader } = require('./offline-loader.cjs');
const load = loader();
const { TelegramService } = load('telegram/telegram.service.ts');
const { DiscordService } = load('discord/discord.service.ts');
const { TicketService } = load('ticket/ticket.service.ts');
const { AgentOperations } = load('openclaw/agent-operations.ts');

function channelService(db, channel) {
  let sends = 0;
  const findUnique = db.ticket.findUnique.bind(db.ticket);
  db.ticket.findUnique = async q => { const row = await findUnique(q); return row ? { ...row, contact: { externalId: 'fake-chat' } } : row; };
  db.platformConnection = { findUnique: async () => ({ isActive: true, config: {} }) };
  const service = channel === 'TELEGRAM' ? new TelegramService(db, {}, {}) : new DiscordService(db, {}, {});
  const sent = async () => { sends++; return { id: 'external-ack', message_id: 'external-ack' }; };
  if (channel === 'TELEGRAM') service.bots.set('tenant-a', { api: { sendMessage: sent } });
  else service.client = { channels: { fetch: async () => ({ isThread: () => true, send: sent }) } };
  return { service, sends: () => sends };
}

for (const changed of ['none', 'ticket', 'message', 'settings']) test(`durable post-triage revision authorizes only its exact continuation: ${changed}`, async () => {
  const { pool, db } = context(); const ops = new AgentOperations(db);
  const parent = await ops.prepare({ id: 'triage-parent', tenantId: 'tenant-a', ticketId: 'a', kind: 'triage', source: 'automation', originMessageId: 'ma' });
  const { scope } = await ops.claim(parent.id, 'tenant-a', 'a', 'triage', 'ma', 'automation');
  await ops.finish(scope, async tx => {
    await tx.ticket.update({ where: { id: 'a' }, data: { metadata: { triaged: true } } });
    await tx.message.create({ data: { id: 'triage-note', tenantId: 'tenant-a', ticketId: 'a', direction: 'OUTBOUND', messageType: 'NOTE', contentText: 'Triage note' } });
    return { action: 'triaged' };
  });
  const saved = await db.agentOperation.findUnique({ where: { id: parent.id } });
  assert.equal(saved.ticketVersion, 1); assert.equal(saved.completedTicketVersion, 3);
  if (changed === 'ticket') await pool.query(`UPDATE public."Ticket" SET metadata='{"human":true}' WHERE id='a'`);
  if (changed === 'message') await pool.query(`INSERT INTO public."Message" (id,"tenantId","ticketId","contentText","createdAt") VALUES ('correction','tenant-a','a','New request',now()+interval '1 second')`);
  if (changed === 'settings') await pool.query(`UPDATE public."Tenant" SET settings=jsonb_set(settings,'{openclawAgentMode}','"off"') WHERE id='tenant-a'`);
  const input = { id: 'reply-child', tenantId: 'tenant-a', ticketId: 'a', kind: 'draft', source: 'automation', originMessageId: 'ma', predecessorId: parent.id };
  const child = await ops.prepare(input);
  assert.equal(child.status, changed === 'none' ? 'PENDING' : 'SUPERSEDED');
  assert.equal(child.predecessorId, parent.id); assert.equal(child.originMessageId, 'ma');
  assert.deepEqual(await ops.prepare(input), child);
  if (changed === 'none') {
    const claim = await ops.claim(child.id, 'tenant-a', 'a', 'draft', 'ma', 'automation'); assert.ok(claim.scope);
  } else assert.equal(child.result.action, 'superseded');
});

test('continuation rejects forged predecessor tenant, target, kind or inbound identity', async () => {
  const { db } = context(); const ops = new AgentOperations(db);
  await ops.prepare({ id: 'parent', tenantId: 'tenant-a', ticketId: 'a', kind: 'triage', source: 'automation', originMessageId: 'ma' });
  for (const changed of [{ tenantId: 'tenant-b', ticketId: 'foreign', originMessageId: null }, { ticketId: 'b', originMessageId: 'mb' }, { originMessageId: 'mb' }, { kind: 'summary' }]) {
    await assert.rejects(() => ops.prepare({ id: 'forged-child', tenantId: 'tenant-a', ticketId: 'a', kind: 'draft', source: 'automation', originMessageId: 'ma', predecessorId: 'parent', ...changed }), /identity/);
  }
  assert.equal(await db.agentOperation.findUnique({ where: { id: 'forged-child' } }), null);
});

test('bookkeeping rejects foreign captured IDs and conflicting acknowledgements', { skip: process.env.TICKETHACKER_TEST_BASELINE ? 'New helper has no v2 counterpart' : false }, async () => {
  const { pool, db } = context(); await outboundRows(pool, 'TELEGRAM');
  const { captureOutboundMessages, recordOutboundDelivery } = load('message-bus/outbound-bookkeeping.ts');
  assert.deepEqual(await captureOutboundMessages(db, 'tenant-b', 'a', 'queued response'), []);
  await assert.rejects(() => recordOutboundDelivery(db, 'tenant-b', ['ma'], 'forged'), /identity/);
  await pool.query(`UPDATE public."Message" SET "externalId"='previous-ack' WHERE id='ma'`);
  await assert.rejects(() => recordOutboundDelivery(db, 'tenant-a', ['ma'], 'conflicting-ack'), /conflict/);
  assert.equal((await pool.query('SELECT "externalId" FROM public."Message" WHERE id=\'ma\'')).rows[0].externalId, 'previous-ack');
});
async function outboundRows(pool, channel) {
  await pool.query('UPDATE public."Ticket" SET channel=$1,metadata=$2 WHERE id=\'a\'', [channel, { threadId: 'fake-thread' }]);
  await pool.query(`UPDATE public."Message" SET direction='OUTBOUND',"contentText"='queued response' WHERE id='ma'`);
}
for (const channel of ['TELEGRAM', 'DISCORD']) {
  test(`actual ${channel} post-send bookkeeping versus actual merge: parent-before-message ordering`, async () => {
    const { pool } = context(); await outboundRows(pool, channel);
    let parentLocked, move;
    const parentReady = new Promise(resolve => { parentLocked = resolve; });
    const moveGate = new Promise(resolve => { move = resolve; });
    const base = adapter(pool, 'mixed-merge');
    const mergerDb = { ...base, $transaction: fn => base.$transaction(tx => {
      const update = tx.message.updateMany.bind(tx.message);
      tx.message.updateMany = async q => { parentLocked(); await moveGate; return update(q); };
      return fn(tx);
    }) };
    const book = adapter(pool, 'bookkeeping');
    // v2 uses autocommit updateMany. Give its implicit transaction an explicit
    // BEGIN solely for session naming/timeouts; add no synthetic row locks.
    const bookDb = { ...book, message: { ...book.message, updateMany: q => book.$transaction(tx => tx.message.updateMany(q)) } };
    const fake = channelService(bookDb, channel);
    const merge = new TicketService(mergerDb, { emit() {} }).merge('tenant-a', 'a', 'b').then(value => ({ value }), error => ({ error }));
    await parentReady;
    const send = fake.service.sendOutbound('a', 'queued response').then(value => ({ value }), error => ({ error }));
    try { await waiting('bookkeeping'); } finally { move(); }
    const results = await Promise.all([merge, send]);
    console.log(JSON.stringify({ mixedConsumer: channel, results: results.map(r => r.error ? { message: r.error.message, code: r.error.code } : r.value) }));
    assert.equal(fake.sends(), 1);
    assert.ok(results.every(r => !r.error), 'mixed consumers must not deadlock or fail after the send');
    assert.equal(results[1].value.bookkeeping, 'recorded');
    const message = (await pool.query('SELECT * FROM public."Message" WHERE id=\'ma\'')).rows[0];
    assert.equal(message.ticketId, 'b'); assert.equal(message.externalId, 'external-ack');
  });
  test(`actual ${channel} retries only database acknowledgement after rollback`, async () => {
    const { pool } = context(); await outboundRows(pool, channel);
    const base = adapter(pool, 'bookkeeping'); let attempts = 0;
    const db = { ...base, $transaction: fn => base.$transaction(async tx => {
      attempts++; const result = await fn(tx);
      if (attempts === 1) throw Object.assign(Error('Injected serialization failure after write'), { code: 'P2034' });
      return result;
    }) };
    const fake = channelService(db, channel); const result = await fake.service.sendOutbound('a', 'queued response');
    assert.equal(fake.sends(), 1); assert.equal(attempts, 2); assert.equal(result.bookkeeping, 'recorded');
    assert.equal((await pool.query('SELECT "externalId" FROM public."Message" WHERE id=\'ma\'')).rows[0].externalId, 'external-ack');
  });
  test(`actual ${channel} acknowledged send with failed bookkeeping is not thrown for outbound retry`, async () => {
    const { pool } = context(); await outboundRows(pool, channel); const base = adapter(pool, 'bookkeeping');
    const db = { ...base, $transaction: async () => { throw Error('Injected bookkeeping outage'); } };
    const fake = channelService(db, channel); const result = await fake.service.sendOutbound('a', 'queued response');
    assert.equal(fake.sends(), 1); assert.equal(result.success, true); assert.equal(result.messageId, 'external-ack');
    assert.equal(result.bookkeeping, 'needs_reconciliation');
    assert.equal((await pool.query('SELECT "externalId" FROM public."Message" WHERE id=\'ma\'')).rows[0].externalId, null);
  });
}
