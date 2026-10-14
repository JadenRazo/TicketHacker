# Verify a persistent installation before agent-integrity rollout

The October 13, 2026 read-only discovery found no TicketHacker application in the
checked AWS us-east-1 inventory or anchor/opsbox container inventories. The anchor
had no `tickethacker` database and an empty Redis keyspace. GitHub reported no
deployment records or environments. Current AWS source includes historical
migration intent, not a running TicketHacker service; current k3s source has no
TicketHacker application manifest. The old Hetzner route remains unverified.

Source-only adoption is therefore the supported next step. This does not prove
global dormancy or authorize creating an installation. Select a release target
only after identifying its controller, API/worker processes and image digests,
PostgreSQL schema/role/volume, Redis database/prefix, external callback producers,
and enabled channel configuration. Do not start NestJS or the development
quickstart to discover them; listeners, schedules and channels have effects.

## Read-only persistent baseline

From the repository root, with `PGSERVICE` selecting the verified connection and
credentials supplied privately through the existing libpq mechanism:

```sh
psql -X -w -v ON_ERROR_STOP=1 -f prisma/preflight-agent-integrity.sql
```

This bounded read-only transaction prints catalog metadata and migration-history
status, never ticket/message rows or migration logs. It rejects missing base
tables, incompatible identity types, existing integrity objects, unresolved
migrations and an already-recorded integrity migration. An absent history table
is reported explicitly and requires baseline reconciliation. Exit zero is not a
full Prisma schema comparison, an RLS acceptance result or deployment approval.
Run the report under the migration role and the intended application role;
owner/superuser/BYPASSRLS results do not establish tenant isolation.

The existing CI `Test` job runs `node --test scripts/test-agent-integrity-preflight.cjs`
against its existing disposable pgvector service. Fifteen positive/negative cases
cover the full prior schema, migration history, partial/repeated adoption, type
drift and nonowner role reporting. Each preflight must preserve the schema/data
dump hash. The fixture creates and removes only its own database and role in that
CI server; it does not start another server or use application credentials. CI
success remains separate from a real installation's baseline and recovery proof.

The first tracked migration adds to an existing schema. A blank database,
`db push` installation and an existing Prisma Migrate history need different
baseline handling. Prepare the actual prior-schema comparison and baseline
record from the verified installation before selecting `migrate resolve` or
`migrate deploy`. Never mark the integrity addition as applied merely to suppress
a Prisma error. Never seed, reset or use `db push` as a migration repair.

## Cutover and recovery prerequisites

No current installation was verified, so target-specific backup, controller and
migration commands remain unprepared. The release operator must bind them to the
actual identities and rehearse recovery before execution:

1. Stop all old API/consumer processes and external callback producers under the
   owning controller. Preserve reconciliation and replica settings. NestJS hosts
   producers and consumers together; disabling just one queue listener does not
   quiesce inbound channel writes or maintenance jobs.
2. Inventory `openclaw-agent`, `ai-tasks`, `outbound-messages` and `maintenance`
   in the verified Redis database/prefix. Quarantine legacy OpenClaw jobs missing
   `operationId` or an explicit `originMessageId` (including null). Do not invent
   identities or re-enqueue the backlog. Preserve uncertain outbound work and
   receipts rather than replaying it to clear a queue.
3. Capture compatible PostgreSQL, Redis and uploads backups after quiescence;
   verify an isolated restore with required extensions, schema, ownership and
   RLS behavior. Record backup checksums and the exact restoration/controller
   commands. Protect operation receipts and any existing delivery evidence.
4. Apply the reconciled baseline and the integrity migration using the selected
   migration owner. Regenerate/build against the selected Prisma schema. Verify
   both `ticket_agent_version` and `message_agent_version` exist on the correct
   public tables with `tgenabled='O'`, and match the reviewed functions. Exercise
   revision changes, receipts and tenant boundaries in the restored environment
   as the actual non-owner application role before opening writes.
5. Update each callback producer to authorize
   `POST /openclaw/agent/operations/:ticketId` as an authenticated AGENT first.
   Its callback must carry the authorized `operationId`, `kind`, captured
   `originMessageId` and a stable terminal `eventId`, plus the configured webhook
   authentication. Verify the actual producer revision; repository callback
   support alone does not prove the caller migrated.
6. Install compatible API/dashboard/consumer revisions before resuming selected
   producers. Verify legacy jobs fail closed, drafts remain unsent, duplicate
   operations return receipts, and stopped results do not populate Use Reply.
   Test Telegram/Discord acknowledgement bookkeeping only for enabled channels
   using synthetic adapters or an explicitly selected test channel; this rollout
   does not require activating a new AI outbound path.

Recovery must preserve terminal and uncertain operation receipts. Keep producers
stopped during recovery; do not delete claims, restore an older Redis snapshot
onto newer receipts, or roll back to an implementation that ignores those
receipts. A pre-change restore is safe only with a reconciled state boundary and
external-effect accounting. After new operations, prefer a compatible forward
fix where a restore would erase replay protection. The
[agent-integrity contract](agent-integrity.md) defines these limits.
