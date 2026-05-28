# Multi-stage build for @fromtheloop/worker.
# Build context is the monorepo root (so pnpm can resolve workspace deps).
# Build with: docker build -t fromtheloop-worker -f apps/worker/Dockerfile .

FROM node:20-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat && corepack enable

# Workspace + per-package manifests first (layer caching: deps don't change as often as source)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/search/package.json packages/search/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# Source
COPY apps/worker apps/worker
COPY packages packages

RUN pnpm --filter @fromtheloop/worker build
# Produce a self-contained /out dir with only prod deps (no devDeps like tsx/typescript)
RUN pnpm --filter @fromtheloop/worker deploy --prod /out

# ---------------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini libc6-compat
COPY --from=builder /out/package.json ./package.json
COPY --from=builder /out/dist ./dist
COPY --from=builder /out/node_modules ./node_modules
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
