FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# --- Build ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json pnpm-workspace.yaml tsconfig.json ./
COPY prisma ./prisma
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN pnpm --filter @tickethacker/api run db:generate
RUN pnpm --filter @tickethacker/api run build

# --- Runner ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=builder /app/prisma ./prisma

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001
CMD ["node", "dist/main.js"]
