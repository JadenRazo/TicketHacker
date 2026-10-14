const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { postgresFixture } = require('./pg-fixture.cjs');
const { adapter } = require('./pg-adapter.cjs');
const { loader } = require('./offline-loader.cjs');
const load = loader();
const { AgentOperations } = load('openclaw/agent-operations.ts');
const { TicketService } = load('ticket/ticket.service.ts');
globalThis.fetch = async () => { throw Error('Network forbidden'); };
const root = path.resolve(__dirname, '../../..');
const migration = fs.readFileSync(process.env.TICKETHACKER_TEST_MIGRATION || path.join(root, 'prisma/migrations/20261013000000_agent_integrity/migration.sql'), 'utf8');
let fixture, pool, db, migrationError;
const settings = { openclawEnabled: true, openclawAutoTriage: true, openclawAgentMode: 'copilot' };

before(async () => {
  fixture = await postgresFixture(); pool = fixture.pool; db = adapter(pool);
  console.log(JSON.stringify((await pool.query('SELECT version() AS version')).rows[0]));
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN; CREATE ROLE tickethacker');
    try {
      await connection.query(fs.readFileSync(path.join(root, 'prisma/schema.sql'), 'utf8'));
      console.log('Full schema restore executed in rollback-only transaction');
    } catch (error) {
      console.log(JSON.stringify({ fullRestore: 'FAILED', code: error.code, message: error.message, detail: error.detail }));
      // This stock image has no vector extension. Do not hide other failures.
      assert.match(error.message, /extension "vector" is not available/);
    } finally { await connection.query('ROLLBACK'); }
  } finally { connection.release(); }
  // Selected structural columns, no vector, no customers, no persistent store.
  await pool.query(`
    CREATE TABLE public."Tenant" (id text PRIMARY KEY, settings jsonb NOT NULL, "updatedAt" timestamp NOT NULL DEFAULT now());
    CREATE TABLE public."Ticket" (id text PRIMARY KEY, "tenantId" text NOT NULL REFERENCES public."Tenant"(id),
      "mergedIntoId" text REFERENCES public."Ticket"(id), status text DEFAULT 'OPEN', "closedAt" timestamp,
      channel text DEFAULT 'CHAT_WIDGET', metadata jsonb NOT NULL DEFAULT '{}');
    CREATE TABLE public."Message" (id text PRIMARY KEY, "tenantId" text NOT NULL REFERENCES public."Tenant"(id),
      "ticketId" text NOT NULL REFERENCES public."Ticket"(id), direction text DEFAULT 'INBOUND',
      "messageType" text DEFAULT 'TEXT', "contentText" text, "externalId" text, "createdAt" timestamp NOT NULL DEFAULT now());
    CREATE ROLE receipt_reader; GRANT USAGE ON SCHEMA public TO receipt_reader;
  `);
  const c = await pool.connect();
  try {
    await c.query("BEGIN; SET LOCAL search_path=''");
    try { await c.query(migration); await c.query('COMMIT'); }
    catch (error) {
      migrationError = { code: error.code, message: error.message };
      console.log(JSON.stringify({ emptySearchPathFailure: migrationError }));
      await c.query('ROLLBACK');
      // Baseline reproduction continues so the independent lock failure is visible.
      if (!process.env.TICKETHACKER_TEST_BASELINE) throw error;
      await c.query(migration);
    }
  } finally { c.release(); }
  await pool.query('GRANT SELECT, INSERT, UPDATE, DELETE ON public."AgentOperation" TO receipt_reader');
});
after(async () => { if (fixture) await fixture.close(); });
beforeEach(async () => {
  await pool.query('TRUNCATE public."Tenant", public."Ticket", public."Message", public."AgentOperation" CASCADE');
  await pool.query('INSERT INTO public."Tenant" (id,settings) VALUES ($1,$3),($2,$3)', ['tenant-a', 'tenant-b', settings]);
  await pool.query(`INSERT INTO public."Ticket" (id,"tenantId") VALUES ('a','tenant-a'),('b','tenant-a'),('foreign','tenant-b');
    INSERT INTO public."Message" (id,"tenantId","ticketId","contentText") VALUES ('ma','tenant-a','a','First request'),('mb','tenant-a','b','Other request');`);
});
test('migration executes with the consolidated dump empty search_path', () => {
  assert.equal(migrationError, undefined);
  if (!process.env.TICKETHACKER_TEST_BASELINE) assert.ok(fs.readFileSync(path.join(root, 'prisma/schema.sql'), 'utf8').endsWith(migration));
});

test('triggers handle insert, edit, move, delete and rollback with empty search_path', async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN; SET LOCAL search_path=''");
    const versions = async () => (await c.query('SELECT id,"agentVersion" FROM public."Ticket" ORDER BY id')).rows.map(r => r.agentVersion);
    assert.deepEqual(await versions(), [1, 1, 0]);
    await c.query(`UPDATE public."Message" SET "contentText"='Correction' WHERE id='ma'`);
    assert.deepEqual(await versions(), [2, 1, 0]);
    await c.query(`UPDATE public."Message" SET "ticketId"='b' WHERE id='ma'`);
    assert.deepEqual(await versions(), [3, 2, 0]);
    await c.query(`DELETE FROM public."Message" WHERE id='ma'`);
    assert.deepEqual(await versions(), [3, 3, 0]);
    await c.query(`INSERT INTO public."Message" (id,"tenantId","ticketId") VALUES ('new','tenant-a','a')`);
    await c.query(`UPDATE public."Ticket" SET metadata='{"human":true}' WHERE id='a'`);
    assert.deepEqual(await versions(), [5, 3, 0]);
  } finally { await c.query('ROLLBACK'); c.release(); }
  assert.deepEqual((await pool.query('SELECT "agentVersion" FROM public."Ticket" ORDER BY id')).rows.map(r => r.agentVersion), [1, 1, 0]);
  assert.equal((await db.message.findUnique({ where: { id: 'ma' } })).ticketId, 'a');
});

async function waiting(application) {
  for (let i = 0; i < 100; i++) {
    const result = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [application]);
    if (result.rows[0].n) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error(`Expected lock wait from ${application}`);
}
async function opposed(first, second) {
  const blocker = await pool.connect();
  let a, b;
  try {
    await blocker.query('BEGIN; SELECT id FROM public."Ticket" WHERE id=\'b\' FOR UPDATE');
    a = first().then(value => ({ value }), error => ({ error }));
    await waiting('merge-first');
    b = second().then(value => ({ value }), error => ({ error }));
    await waiting('merge-second');
  } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  return Promise.all([a, b]);
}
test('actual opposing merge consumers serialize without SQL deadlock or merge cycle', async () => {
  const effects = []; const sink = { emit: (...args) => effects.push(args) };
  const a = new TicketService(adapter(pool, 'merge-first'), sink);
  const b = new TicketService(adapter(pool, 'merge-second'), sink);
  const results = await opposed(() => a.merge('tenant-a', 'b', 'a'), () => b.merge('tenant-a', 'a', 'b'));
  console.log(JSON.stringify({ opposingMerge: results.map(r => r.error ? { error: r.error.message, code: r.error.code } : { applied: true }) }));
  assert.equal(results.filter(r => r.error?.code === '40P01').length, 0, 'No PostgreSQL deadlock');
  assert.equal(results.filter(r => r.error).length, 1);
  assert.match(results.find(r => r.error).error.message, /already been merged/);
  const tickets = await db.ticket.findMany({ where: { tenantId: 'tenant-a' } });
  assert.equal(tickets.filter(t => t.mergedIntoId).length, 1);
  const messages = await db.message.findMany(); assert.equal(new Set(messages.map(m => m.ticketId)).size, 1);
  assert.equal(effects.length, 1);
});
test('opposing direct message moves use compatible trigger parent lock order', async () => {
  const a = adapter(pool, 'merge-first'), b = adapter(pool, 'merge-second');
  const results = await opposed(
    () => a.$transaction(tx => tx.message.update({ where: { id: 'mb' }, data: { ticketId: 'a' } })),
    () => b.$transaction(tx => tx.message.update({ where: { id: 'ma' }, data: { ticketId: 'b' } })),
  );
  assert.ok(results.every(r => !r.error), JSON.stringify(results.map(r => r.error?.message)));
  assert.deepEqual((await db.message.findMany({ orderBy: { id: 'asc' } })).map(m => m.ticketId), ['b', 'a']);
});
test('actual merge rejects foreign, self and already merged targets without effects', async () => {
  const effects = []; const service = new TicketService(db, { emit: (...args) => effects.push(args) });
  await assert.rejects(() => service.merge('tenant-a', 'a', 'foreign'), /not found/);
  await assert.rejects(() => service.merge('tenant-a', 'a', 'a'), /itself/);
  await service.merge('tenant-a', 'a', 'b');
  await assert.rejects(() => service.merge('tenant-a', 'b', 'a'), /already been merged/);
  assert.equal(effects.length, 1);
});

const prepare = (ops, id = 'op', source = 'manual') => ops.prepare({ id, tenantId: 'tenant-a', ticketId: 'a', kind: 'triage', source });
const claim = (ops, op, eventId) => ops.claim(op.id, 'tenant-a', 'a', 'triage', op.originMessageId, op.source, eventId);
test('real locks serialize duplicate operation preparation and claims; receipt survives a new request', async () => {
  const ops = new AgentOperations(db);
  const [op, duplicate] = await Promise.all([prepare(ops), prepare(ops)]); assert.equal(op.id, duplicate.id);
  const claims = await Promise.all([claim(ops, op), claim(ops, op)]);
  assert.equal(claims.filter(c => c.scope).length, 1); assert.equal(claims.find(c => c.result).result.action, 'uncertain');
  const result = { action: 'triaged', summary: 'Saved receipt', confidence: 1, toolCalls: [] };
  await ops.finish(claims.find(c => c.scope).scope, async tx => {
    await tx.ticket.update({ where: { id: 'a' }, data: { metadata: { applied: true } } }); return result;
  });
  await pool.query(`INSERT INTO public."Message" (id,"tenantId","ticketId","contentText","createdAt") VALUES ('new','tenant-a','a','Correction',now()+interval '1 second')`);
  const retry = await prepare(ops); assert.equal(retry.originMessageId, 'ma');
  assert.deepEqual((await claim(ops, retry)).result, result);
  await assert.rejects(() => ops.prepare({ id: 'op', tenantId: 'tenant-a', ticketId: 'a', kind: 'triage', source: 'manual', originMessageId: 'new' }), /identity/);
  await assert.rejects(() => ops.prepare({ id: 'op', tenantId: 'tenant-b', ticketId: 'foreign', kind: 'triage', source: 'manual' }), /identity/);
});
for (const change of ['ticket', 'message', 'settings']) test(`real ${change} change supersedes a pending operation without applying staged work`, async () => {
  const ops = new AgentOperations(db); const op = await prepare(ops, 'op', 'automation'); const { scope } = await claim(ops, op);
  if (change === 'ticket') await pool.query(`UPDATE public."Ticket" SET metadata='{"human":true}' WHERE id='a'`);
  if (change === 'message') await pool.query(`UPDATE public."Message" SET "contentText"='Correction' WHERE id='ma'`);
  if (change === 'settings') await pool.query(`UPDATE public."Tenant" SET settings=jsonb_set(settings,'{openclawAgentMode}','"off"') WHERE id='tenant-a'`);
  let applied = false; const finished = await ops.finish(scope, async () => { applied = true; return {}; });
  assert.equal(finished.result.action, 'superseded'); assert.equal(applied, false);
  assert.equal((await db.agentOperation.findUnique({ where: { id: 'op' } })).status, 'SUPERSEDED');
});
test('business mutation and receipt roll back together; interrupted claim is not replayed', async () => {
  const ops = new AgentOperations(db); const op = await prepare(ops); const { scope } = await claim(ops, op);
  await assert.rejects(() => ops.finish(scope, async tx => {
    await tx.ticket.update({ where: { id: 'a' }, data: { metadata: { bad: true } } });
    throw Error('Injected failure before receipt');
  }), /Injected/);
  assert.deepEqual((await db.ticket.findUnique({ where: { id: 'a' } })).metadata, {});
  assert.equal((await db.ticket.findUnique({ where: { id: 'a' } })).agentVersion, 1);
  assert.equal((await db.agentOperation.findUnique({ where: { id: 'op' } })).status, 'RUNNING');
  assert.equal((await claim(ops, op)).result.action, 'uncertain');
});
test('callback event identity stays bound after a completed receipt', async () => {
  const ops = new AgentOperations(db); const op = await prepare(ops, 'callback', 'callback');
  const { scope } = await claim(ops, op, 'event-1');
  await ops.finish(scope, async () => ({ action: 'triaged' }));
  assert.equal((await claim(ops, op, 'event-1')).result.action, 'triaged');
  await assert.rejects(() => claim(ops, op, 'event-2'), /event identity/);
});
test('AgentOperation RLS hides and rejects cross-tenant rows for a nonowner role', async () => {
  const ops = new AgentOperations(db); await prepare(ops);
  await ops.prepare({ id: 'foreign-op', tenantId: 'tenant-b', ticketId: 'foreign', kind: 'triage', source: 'manual' });
  const c = await pool.connect();
  try {
    await c.query("BEGIN; SET LOCAL ROLE receipt_reader; SELECT set_config('app.current_tenant','tenant-a',true)");
    const identity = (await c.query('SELECT r.rolsuper,r.rolbypassrls FROM pg_roles r WHERE rolname=current_user')).rows[0];
    assert.deepEqual(identity, { rolsuper: false, rolbypassrls: false });
    assert.deepEqual((await c.query('SELECT id FROM public."AgentOperation"')).rows.map(r => r.id), ['op']);
    assert.equal((await c.query(`UPDATE public."AgentOperation" SET status='FORGED' WHERE id='foreign-op'`)).rowCount, 0);
    await c.query('SAVEPOINT denied');
    await assert.rejects(() => c.query(`UPDATE public."AgentOperation" SET "tenantId"='tenant-b' WHERE id='op'`), e => e.code === '42501');
    await c.query('ROLLBACK TO SAVEPOINT denied');
    await assert.rejects(() => c.query(`INSERT INTO public."AgentOperation" (id,"tenantId","ticketId",kind,source,"ticketVersion","settingsVersion","updatedAt") VALUES ('forged','tenant-b','foreign','triage','manual',0,'none',now())`), e => e.code === '42501');
  } finally { await c.query('ROLLBACK'); c.release(); }
});

module.exports = { context: () => ({ pool, db }), waiting };
