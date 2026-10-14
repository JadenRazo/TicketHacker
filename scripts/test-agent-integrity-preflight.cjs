// CI only: reuse the existing job.services.postgres service, never start a server.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

test('read-only integrity preflight on the existing disposable CI server', async t => {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This destructive fixture is CI-only');
  const container = process.env.PG_CONTAINER_ID;
  assert.match(container ?? '', /^[a-f0-9]{64}$/, 'Use the exact job.services.postgres.id');
  const db = `integrity_preflight_${process.pid}`;
  const role = `integrity_preflight_reader_${process.pid}`;
  const root = path.join(__dirname, '..');
  const preflight = fs.readFileSync(path.join(root, 'prisma/preflight-agent-integrity.sql'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20261013000000_agent_integrity/migration.sql'), 'utf8');
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.sql'), 'utf8');
  const parts = schema.split('\n-- Agent operation integrity\n');
  assert.equal(parts.length, 2, 'Consolidated schema must have exactly one integrity boundary');
  assert.equal(parts[1].trim(), migration.trim(), 'Consolidated addition differs from tracked migration');
  const setting = "ALTER DATABASE tickethacker SET statement_timeout = '30s';";
  assert.equal(parts[0].split(setting).length, 2, 'Expected one database setting in consolidated baseline');
  const fullBaseline = parts[0].replace(setting, `ALTER DATABASE ${db} SET statement_timeout = '30s';`);
  const base = 'CREATE TABLE public."Tenant" (id text PRIMARY KEY);' +
    'CREATE TABLE public."Ticket" (id text PRIMARY KEY);' +
    'CREATE TABLE public."Message" (id text PRIMARY KEY, "ticketId" text NOT NULL);';
  const history = 'CREATE TABLE public._prisma_migrations (migration_name text, checksum text,' +
    'finished_at timestamptz, rolled_back_at timestamptz, applied_steps_count integer, started_at timestamptz);';
  const invoke = (program, database, args, input) => {
    const result = spawnSync('docker', ['exec', '-i', container, program,
      '-U', 'tickethacker', '-d', database, ...args],
    {input, encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024});
    assert.ifError(result.error);
    assert.equal(result.signal, null, `${program} terminated`);
    return result;
  };
  const sql = (body, database = db) => invoke('psql', database, ['-X', '-qAt', '-w', '-v', 'ON_ERROR_STOP=1'], body);
  const snapshot = () => {
    const result = invoke('pg_dump', db, ['--no-owner']);
    assert.equal(result.status, 0, result.stderr);
    const stable = result.stdout.split('\n').filter(line => !/^\\(?:un)?restrict\b/.test(line)).join('\n');
    return createHash('sha256').update(stable).digest('hex');
  };
  const check = async (name, setup, error, inspect, prefix = '') => t.test(name, () => {
    const reset = sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public;\n' + setup);
    assert.equal(reset.status, 0, reset.stderr);
    const before = snapshot();
    const result = sql(prefix + preflight);
    assert.equal(snapshot(), before, 'Preflight changed schema or data');
    assert.equal(result.status, error ? 3 : 0, result.stderr);
    if (error) assert.match(result.stderr, error);
    const rows = result.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
    if (inspect) inspect(rows);
    console.log(JSON.stringify({preflightCase: name, schemaAndDataUnchanged: true, sha256: before}));
  });
  let created = false;
  let roleCreated = false;
  try {
    const create = sql(`CREATE DATABASE ${db};`, 'postgres');
    assert.equal(create.status, 0, create.stderr);
    created = true;
    const createRole = sql(`CREATE ROLE ${role};`, 'postgres');
    assert.equal(createRole.status, 0, createRole.stderr);
    roleCreated = true;
    await check('accepts the full pre-integrity schema with pgvector', fullBaseline, null, ([r, historyRow]) => {
      assert.equal(r.transaction_read_only, 'on');
      assert.equal(r.vector_installed, true);
      assert.equal(r.migration_history_present, false);
      assert.equal(r.base_tables.length, 3);
      assert.match(historyRow.migration_history, /^absent;/);
    });
    await check('reports a minimal absent-history baseline without claiming full compatibility', base, null,
      ([r]) => assert.match(r.scope, /not a full Prisma baseline/));
    await check('reports empty migration history', base + history, null,
      ([r, h]) => { assert.equal(r.migration_history_present, true); assert.deepEqual(h.migration_history, []); });
    await check('accepts a completed earlier baseline record', base + history +
      "INSERT INTO _prisma_migrations VALUES ('baseline','fixture',NOW(),NULL,1,NOW());", null,
      ([, h]) => assert.equal(h.migration_history[0].finished, true));
    await check('reports an explicitly rolled-back addition for reconciliation', base + history +
      "INSERT INTO _prisma_migrations VALUES ('20261013000000_agent_integrity','fixture',NULL,NOW(),0,NOW());", null,
      ([, h]) => assert.equal(h.migration_history[0].rolled_back, true));
    await check('rejects unfinished migration history', base + history +
      "INSERT INTO _prisma_migrations VALUES ('baseline','fixture',NULL,NULL,0,NOW());", /Migration history is unresolved/);
    await check('rejects an applied integrity receipt without objects', base + history +
      "INSERT INTO _prisma_migrations VALUES ('20261013000000_agent_integrity','fixture',NOW(),NULL,1,NOW());", /Migration history is unresolved/);
    await check('rejects db-push partial adoption', base + 'ALTER TABLE "Ticket" ADD "agentVersion" integer;', /Integrity objects already exist/);
    await check('rejects an isolated operation table', base + 'CREATE TABLE "AgentOperation" (id text);', /Integrity objects already exist/);
    await check('rejects full adoption even when one trigger is disabled', base + migration +
      'ALTER TABLE "Ticket" DISABLE TRIGGER ticket_agent_version;', /Integrity objects already exist/);
    await check('rejects a missing base table', 'CREATE TABLE "Tenant" (id text PRIMARY KEY);', /Required base table missing/);
    await check('rejects nullable parent identity', base + 'ALTER TABLE "Message" ALTER "ticketId" DROP NOT NULL;', /Message parent identity differs/);
    await check('rejects base ID type drift', base + 'ALTER TABLE "Ticket" ALTER id TYPE bigint USING id::bigint;', /Base ID types differ/);
    await check('rejects reapplication after the complete real schema addition', fullBaseline + migration, /Integrity objects already exist/);
    await check('reports a nonowner role without claiming owner RLS evidence', base +
      `GRANT USAGE ON SCHEMA public TO ${role};`, null, ([r]) => {
      assert.equal(r.role_superuser, false);
      assert.equal(r.role_bypassrls, false);
      assert.ok(r.base_tables.every(table => table.current_role_owns === false));
    }, `SET ROLE ${role};\n`);
  } finally {
    if (created) {
      const drop = sql(`DROP DATABASE ${db};`, 'postgres');
      assert.equal(drop.status, 0, drop.stderr);
    }
    if (roleCreated) {
      const dropRole = sql(`DROP ROLE ${role};`, 'postgres');
      assert.equal(dropRole.status, 0, dropRole.stderr);
    }
  }
});
