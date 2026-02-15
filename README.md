# TicketHacker

Multi-tenant ticketing platform with omnichannel support. Built for teams that need to manage customer conversations across chat widgets, Discord, Telegram, email, and API integrations from a single dashboard — with real-time updates, automation, and AI-powered features.

## Features

**Omnichannel Messaging**
- Embeddable chat widget (Preact, Shadow DOM isolated)
- Discord bot with support panels, ticket modals, and thread management
- Telegram bot with per-tenant registration and webhook handling
- Inbound/outbound email with ticket threading via headers
- REST API channel for programmatic integrations

**Real-Time Collaboration**
- Live ticket and message updates via WebSocket (Socket.IO)
- Agent presence and typing indicators
- Viewer tracking (who's looking at a ticket)
- Horizontal scaling via Redis adapter

**Automation & Productivity**
- Macros: multi-step actions (set status, priority, assignee, tags, send replies, add notes)
- Automation rules: conditional triggers (auto-assign, SLA breach alerts, etc.)
- Canned responses with shortcuts and scoped visibility (personal, team, tenant)
- Saved views for custom ticket filtering
- Command palette for quick navigation (Ctrl+K)

**AI-Powered (OpenAI-Compatible)**
- Auto-classification: category, priority, sentiment, team suggestion
- Reply suggestions with tone options (professional, friendly, empathetic)
- Thread summarization with action items
- Embedding generation for future semantic search (pgvector ready)

**Multi-Tenancy**
- Row-level security policies on every table
- Tenant isolation enforced at both database and application layers
- Per-tenant settings, branding, custom fields, and plan tiers

**Ticket Management**
- Status tracking (Open, Pending, Resolved, Closed)
- Priority levels (Low, Normal, High, Urgent)
- SLA deadline management with breach detection
- Ticket merging and snoozing
- Custom fields per tenant (text, number, dropdown, date, boolean)
- Tag-based categorization
- File attachments

## Tech Stack

| Layer | Technology |
|---|---|
| API | NestJS 11, Prisma 6, Socket.IO, BullMQ |
| Dashboard | React 19, Vite 7, Tailwind CSS 4, TanStack Query, Zustand, TipTap |
| Widget | Preact 10, Vite 7, Shadow DOM |
| Database | PostgreSQL 16 with pgvector |
| Cache/Queues | Redis 7 |
| Auth | JWT + Passport, Argon2 hashing |
| Bots | Discord.js 14, Grammy 1.40 (Telegram) |
| Email | Nodemailer (Mailhog for dev) |

## Architecture

```
packages/
  api/          NestJS backend — REST, WebSocket, job queues, integrations
  dashboard/    React agent dashboard — ticket management, real-time UI
  widget/       Preact embeddable chat widget — Shadow DOM isolated
  shared/       Shared TypeScript enums and type definitions
prisma/
  schema.prisma Prisma schema (source of truth)
  schema.sql    Consolidated SQL dump with RLS policies
scripts/
  seed.ts       Database seeder with sample data
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

## Getting Started

```bash
# Clone and install
git clone <repo-url> && cd TicketHacker
pnpm install

# Copy environment config
cp .env.example .env

# Start infrastructure (Postgres w/ pgvector, Redis, Mailhog)
docker compose up -d

# Push schema to database and generate Prisma client
pnpm db:push && pnpm db:generate

# Seed with sample data
pnpm seed

# Start the API
pnpm dev

# In separate terminals:
pnpm dashboard   # http://localhost:5173
pnpm widget      # http://localhost:5174
```

## Default Credentials (after seeding)

| Email | Password | Role |
|---|---|---|
| owner@acme-corp.com | password123 | Owner |
| admin@acme-corp.com | password123 | Admin |
| agent@acme-corp.com | password123 | Agent |

A second tenant (Beta Inc) is also seeded with `owner@beta-inc.com`, `admin@beta-inc.com`, and `agent@beta-inc.com`.

## Ports

| Service | Port | Description |
|---|---|---|
| API | 3001 | REST + WebSocket |
| Dashboard | 5173 | Agent UI |
| Widget | 5174 | Chat widget dev server |
| PostgreSQL | 5434 | Database (pgvector) |
| Redis | 6381 | Job queues + pub/sub |
| Mailhog | 8025 | Email testing UI |

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. All secrets are read from environment variables — nothing is hardcoded.

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | Redis connection |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | JWT signing keys (change in production) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | Email transport (Mailhog for dev) |
| `OPENCLAW_API_URL` / `OPENCLAW_API_KEY` | AI provider (OpenAI-compatible endpoint) |
| `DISCORD_BOT_TOKEN` / `DISCORD_CLIENT_ID` | Discord bot credentials |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `APP_URL` / `WIDGET_URL` | Frontend URLs for CORS |

## Embedding the Widget

Add the script tag to any page. It auto-initializes and renders inside a Shadow DOM for full style isolation.

```html
<script
  src="https://your-cdn.com/widget.js"
  data-tenant-id="your-tenant-uuid"
  data-api-url="https://your-api.com"
></script>
```

Or initialize programmatically:

```js
TicketHackerWidget.init({
  tenantId: 'your-tenant-uuid',
  apiUrl: 'https://your-api.com',
});
```

Build the widget for production with:

```bash
pnpm --filter @tickethacker/widget build
```

The output is a single IIFE bundle in `packages/widget/dist/`.

## Job Queues

BullMQ processes background work across three queues:

| Queue | Purpose |
|---|---|
| `outbound-messages` | Dispatch messages to external channels (Discord, Telegram, Email, Widget) |
| `ai-tasks` | Ticket classification, embedding generation, summarization |
| `maintenance` | Auto-close resolved tickets (hourly), unsnooze (every minute), SLA breach checks (every 5 min) |

## Database

Schema is managed via Prisma (`prisma/schema.prisma`). A consolidated SQL dump with row-level security policies lives at `prisma/schema.sql`.

```bash
pnpm db:push       # Sync schema to database
pnpm db:generate   # Regenerate Prisma client
pnpm db:studio     # Open Prisma Studio GUI
pnpm seed          # Re-seed sample data
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start API in watch mode |
| `pnpm dashboard` | Start dashboard dev server |
| `pnpm widget` | Start widget dev server |
| `pnpm build` | Build API for production |
| `pnpm seed` | Seed database with sample data |
| `pnpm db:push` | Push Prisma schema to database |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:studio` | Open Prisma Studio |

## Production Notes

- Replace all placeholder JWT secrets with cryptographically random strings
- Swap Mailhog for a real SMTP provider (SendGrid, SES, etc.)
- Configure a proper CORS allowlist in the API
- Set up Redis with authentication and persistence
- Use a connection pooler (PgBouncer) for PostgreSQL
- Serve the widget bundle from a CDN
- Add rate limiting to public-facing endpoints
- Configure monitoring and structured logging

## License

UNLICENSED
