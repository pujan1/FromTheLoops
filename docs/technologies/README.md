# Technologies

This folder breaks the FromTheLoop stack into one reference page per technology. Use these pages when you need to answer:

- What does this tool do for the product?
- Where is it configured or called in the repo?
- How does it fit into the local, CI, and production workflows?
- What tradeoffs or gotchas have already shown up?

For the full system picture, start with [architecture.md](../architecture.md). For decision history, see [ADR-0001](../adr/0001-stack-choice.md), [ADR-0002](../adr/0002-orm-drizzle.md), and [ADR-0003](../adr/0003-i18n-url-contract.md).

## Application

| Technology | Role |
|---|---|
| [Next.js](next-js.md) | Web app, route handlers, server components, API endpoints |
| [React](react.md) | UI rendering model inside the Next.js app |
| [next-intl](next-intl.md) | Message catalogs and single-locale i18n foundation |
| [Clerk](clerk.md) | Auth, sessions, protected routes, prebuilt auth UI |
| [Zod](zod.md) | Runtime validation for shared submission data |

## Data, Jobs, And Search

| Technology | Role |
|---|---|
| [PostgreSQL](postgresql.md) | Source-of-truth relational database |
| [Neon](neon.md) | Hosted Postgres for production and future environment branches |
| [Drizzle ORM](drizzle.md) | Typed schema, migrations, and query helpers |
| [Redis](redis.md) | BullMQ queue broker and future cache |
| [BullMQ](bullmq.md) | Background job queue between web and worker |
| [Typesense](typesense.md) | Faceted search index, planned for Sprint 3 |

## Platform And Infrastructure

| Technology | Role |
|---|---|
| [pnpm Workspaces](pnpm-workspaces.md) | Monorepo package graph and scripts |
| [TypeScript](typescript.md) | Static typing across app and packages |
| [Docker](docker.md) | Local dependencies and production compose stack |
| [Vercel](vercel.md) | Hosting for the Next.js app |
| [Hetzner Cloud](hetzner.md) | Self-hosted worker, Redis, and Typesense box |
| [Cloudflare](cloudflare.md) | DNS, certbot DNS-01, planned email/R2 |
| [Cloudflare R2](cloudflare-r2.md) | Planned object storage for uploads and exports |
| [Certbot](certbot.md) | Let's Encrypt certificate automation for Redis TLS |
| [systemd](systemd.md) | Boot-time management for the production compose stack |
| [ufw and fail2ban](ufw-fail2ban.md) | Host firewall and SSH brute-force protection |
| [Squarespace](squarespace.md) | Registrar only for `pujan.tech` |

## Quality And Operations

| Technology | Role |
|---|---|
| [Vitest](vitest.md) | Unit and database integration tests |
| [Testcontainers](testcontainers.md) | Real Postgres containers for db tests |
| [Playwright](playwright.md) | End-to-end browser tests for the web app |
| [GitHub Actions](github-actions.md) | CI typecheck, lint, and test workflow |
| [Sentry](sentry.md) | Error tracking for web and worker |
| [Resend](resend.md) | Planned transactional email provider |
| [ESLint](eslint.md) | Linting for web and worker code |
| [tsx](tsx.md) | TypeScript script runner for dev and db scripts |
| [corepack](corepack.md) | Toolchain shim for the pinned pnpm version |
| [ioredis](ioredis.md) | Redis client used transitively through BullMQ |
