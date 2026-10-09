# Working on TicketHacker

Keep customer conversations consistent across channels and isolated between
tenants. Read `README.md`, the affected package manifest and executable service
code; feature descriptions are not proof of complete production hardening.
The private workspace packages are not authorization to publish packages or data.

## Follow the affected path

- `packages/api/` owns NestJS auth, tickets, channels, automation and BullMQ;
  `packages/dashboard/` owns the agent UI, `packages/widget/` the embedded client,
  and `packages/shared/` shared types. `prisma/schema.prisma` owns schema and
  `prisma/schema.sql` records RLS policies. Check both for persistence changes.
- Tenant identity comes from authenticated context. Preserve tenant/role checks
  across HTTP, sockets, uploads, jobs and related-record lookups. Inspect
  `packages/api/src/common/guards/tenant.guard.ts` and
  `packages/api/src/prisma/prisma.service.ts`; a helper named `withTenant` or a
  policy in a SQL file does not prove all queries use effective RLS. Exercise
  two tenants and forged related IDs when changing access behavior.
- `packages/api/src/message-bus/` owns adapters and outbound jobs;
  `packages/api/src/webhook/` owns signed delivery/retries. Preserve tenant/channel
  selection, threading, delivery identity and truthful failure states. Check
  duplicate inbound events, retry delivery and stale/inactive connections with
  fixtures. Do not claim exactly-once delivery merely because a job completed.
- `packages/api/src/gateway/` and `services/realtime/` are distinct implementations.
  Confirm the deployed transport and Compose wiring before changing socket/auth
  contracts; TypeScript CI does not validate the Go service automatically.
- `packages/api/src/ai/ai.service.ts` defaults to a local Ollama-compatible
  endpoint through `OPENCLAW_API_URL`. Preserve configurable local-first use;
  do not silently route support content to a hosted provider or replace the
  product adapter with an agent-review engine. Model names/API support still
  need verification against the selected local provider. Mock AI in tests.

Drafting a reply is not permission to send it. Bots, SMTP, webhooks, notification
jobs and automation can contact real people when started with real credentials.
Use Mailhog/test adapters and disposable queues/databases, with no real tokens
or customer transcripts. Schema pushes and seeding write data; do not use the
README's quickstart against an existing deployment. Preserve uploads and secrets.

## Verify and deliver

Use `.github/workflows/ci.yml` for Node/pnpm versions and isolated service setup.
Existing root commands include `pnpm --filter @tickethacker/api test`,
`pnpm --filter @tickethacker/dashboard run lint`, and per-package `run build`
for API/dashboard/widget. API builds require generated Prisma client. The API
`run lint` script includes `--fix`, so it edits files; review those diffs.
The root `pnpm build` builds only the API. Add targeted regression coverage for
changed access/delivery behavior; existing tests are not a full channel audit.
Prose edits need source/link checks, not live integrations or schema setup.

PR/main CI validates workflows, lints, builds API/dashboard and runs API tests;
it does not deploy. Widget and Go changes need their own scoped verification.
Write docs/PRs with the problem, resulting behavior, actual checks and limits.
Use focused commits following history, otherwise `type: concrete change`.
Report local, PR, publish and live-message effects separately.
