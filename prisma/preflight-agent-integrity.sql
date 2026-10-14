-- Pre-migration catalog check only. Never use db push to repair a failed check.
-- psql -X -w -v ON_ERROR_STOP=1 -f prisma/preflight-agent-integrity.sql
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = pg_catalog, public;
SET LOCAL row_security = off;

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['Tenant', 'Ticket', 'Message'] LOOP
    IF NOT EXISTS (SELECT FROM pg_class WHERE oid = to_regclass(format('public.%I', target)) AND relkind = 'r') THEN
      RAISE EXCEPTION 'Required base table missing; identify the persistent baseline first';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid = to_regclass(format('public.%I', target))
        AND attname = 'id' AND atttypid = 'text'::regtype AND attnotnull AND NOT attisdropped) THEN
      RAISE EXCEPTION 'Base ID types differ from source; reconcile schema before migration';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'public."Message"'::regclass
      AND attname = 'ticketId' AND atttypid = 'text'::regtype AND attnotnull AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Message parent identity differs from source';
  END IF;
  IF to_regclass('public."AgentOperation"') IS NOT NULL
    OR EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'public."Ticket"'::regclass
      AND attname = 'agentVersion' AND NOT attisdropped)
    OR to_regprocedure('public.bump_ticket_agent_version()') IS NOT NULL
    OR to_regprocedure('public.bump_message_ticket_version()') IS NOT NULL
    OR EXISTS (SELECT FROM pg_trigger WHERE tgrelid IN ('public."Ticket"'::regclass, 'public."Message"'::regclass)
      AND tgname IN ('ticket_agent_version', 'message_agent_version')) THEN
    RAISE EXCEPTION 'Integrity objects already exist; reconcile partial/applied/db-push state, do not reapply';
  END IF;
END $$;

SELECT json_build_object(
  'scope', 'pre-integrity catalog only; not a full Prisma baseline or deployment approval',
  'database', current_database(), 'role', current_user,
  'transaction_read_only', current_setting('transaction_read_only'),
  'role_superuser', (SELECT rolsuper FROM pg_roles WHERE rolname = current_user),
  'role_bypassrls', (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user),
  'base_tables', (SELECT json_agg(json_build_object('table', relname, 'rls', relrowsecurity,
    'force_rls', relforcerowsecurity, 'current_role_owns', relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)))
    FROM pg_class WHERE oid IN ('public."Tenant"'::regclass, 'public."Ticket"'::regclass, 'public."Message"'::regclass)),
  'vector_installed', EXISTS (SELECT FROM pg_extension WHERE extname = 'vector'),
  'migration_history_present', to_regclass('public._prisma_migrations') IS NOT NULL
);

-- psql branches keep a missing Prisma history table from becoming a SQL error.
SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS history_present \gset
\if :history_present
SELECT json_build_object('migration_history', COALESCE(json_agg(json_build_object(
  'name', migration_name, 'checksum', checksum, 'finished', finished_at IS NOT NULL,
  'rolled_back', rolled_back_at IS NOT NULL, 'steps', applied_steps_count) ORDER BY started_at), '[]'::json))
FROM public._prisma_migrations;
DO $$ BEGIN
  IF EXISTS (SELECT FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
    OR EXISTS (SELECT FROM public._prisma_migrations
      WHERE migration_name = '20261013000000_agent_integrity' AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'Migration history is unresolved or integrity already recorded; stop for reconciliation';
  END IF;
END $$;
\else
SELECT json_build_object('migration_history', 'absent; full persistent baseline reconciliation required');
\endif
ROLLBACK;
