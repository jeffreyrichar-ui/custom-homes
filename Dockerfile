# syntax=docker/dockerfile:1.7

# ---- Stage 1: build ----
FROM node:20-alpine AS builder

# better-sqlite3 needs build tools to compile native bindings during pnpm install.
RUN apk add --no-cache python3 make g++ libc6-compat

# Enable pnpm via corepack (version pinned by package.json#packageManager).
RUN corepack enable

WORKDIR /app

# Copy workspace manifests first to maximize layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Install all workspace deps (no-frozen-lockfile: lockfile may drift in CI).
RUN pnpm install --no-frozen-lockfile

# Copy sources after deps install so source changes don't bust the deps layer.
COPY apps/server apps/server
COPY packages/shared packages/shared

# Build shared first so its dist/ exists before the server build resolves it.
RUN pnpm --filter @custom-homes/shared build

# Build server (emits to apps/server/dist).
RUN pnpm --filter @custom-homes/server build

# Prune dev deps to slim the prod node_modules we copy into the runtime stage.
RUN pnpm --filter @custom-homes/server --prod deploy /app/deploy/server

# ---- Stage 2: runtime ----
FROM node:20-alpine AS runtime

# libc6-compat for any prebuilt native modules; tini for proper signal handling.
RUN apk add --no-cache libc6-compat tini

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Server runtime layout: dist + production node_modules (already deployed/pruned).
COPY --from=builder /app/deploy/server/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json

# Ship the shared package's built dist + manifest so Node can resolve
# `@custom-homes/shared` at runtime via the workspace symlink in node_modules.
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json

EXPOSE 4000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/server/dist/index.js"]
