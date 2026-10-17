# AI Daily

Two independent, source-backed weekday learning quizzes. Built for ChatGPT Sites with Vinext, React, Cloudflare Workers and D1. Development is on `feat/init`.

## What works

- Separate technical and general editions, archives, rankings and personal bests.
- Five briefings and ten questions, paired server-side answer locking, feedback and cross-device resumption.
- First attempts ranked on their edition, including archives; idempotent practice retakes stay separate.
- Atomic publication, topic/question history, source evidence caching, owner reports and audited regrading.
- Responsive desktop/mobile interface with ChatGPT sign-in and public display names.

The owner has **approved cloud generation without a hard credit cap**. Bounded research, caching, evidence checks and usage logs remain. The Sites MCP publishing tools are implemented; deployment, cloud writer verification and the linked schedule are still pending. No separately billed model API is used. Development fixtures are synthetic and never represented as researched news. See [cloud generation](docs/cloud-generation.md) and [validation](docs/validation.md).

## Local setup

Use Node.js 24 and npm. On a fresh clone:

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_lush_blue_marvel.sql
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_integrity.sql
npm run db:seed
npm run dev
```

Apply each migration once, in order. This workspace's local database is already migrated and seeded. Local and hosted D1 are separate. `db:seed` is repeat-safe and creates four synthetic editions dated October 15–16, 2026. Browse **The archive** to try them; the current date may correctly show unavailable. Do not relabel fixtures as current news.

Open the printed loopback URL (normally http://127.0.0.1:5173). The starter's loopback-only mock ChatGPT sign-in uses a development identity. Mock authentication is removed from production builds. Do not expose the development server publicly. Local configuration belongs in ignored `.env.local`/`.dev.vars` files; `.env.example` lists names without values. No secret is required for visitor fixture testing.

## Checks

```sh
npm run typecheck
npm test
npm run check:source
npm run build
node scripts/api-smoke.mjs
```

The HTTP smoke check requires the local preview and fixtures. For browser verification install Playwright and its Chromium browser in your development environment, then run `npm run test:ui`. A bundled Playwright module can instead be selected with `PLAYWRIGHT_MODULE`; `PLAYWRIGHT_CHANNEL=chrome` uses an installed Chrome browser. Screenshots and results are ignored under `test-results/`. The tests use real SQLite migrations and local D1; no model calls are made. CI runs types, unit/integration checks, source hygiene and the production build.

## Structure

| Path              | Responsibility                                                         |
| ----------------- | ---------------------------------------------------------------------- |
| `app/`            | Quiz UI and authorized HTTP routes                                     |
| `lib/domain.ts`   | Edition validation, public projections, Toronto time rules             |
| `lib/store.ts`    | D1 persistence, atomic publication and user ownership                  |
| `lib/research.ts` | Bounded source retrieval, evidence matching and candidate ranking      |
| `lib/pipeline.ts` | Cloud task handoff, run tracking and editorial policy                  |
| `db/`, `drizzle/` | Schema, indexes, immutable records, completion triggers and score view |
| `scripts/`        | Local fixtures, smoke checks, source hygiene and publication/readback  |
| `tests/`          | Integrity, concurrency, editorial and security scenarios               |

Read [operations](docs/operations.md), [architecture](docs/architecture.md), [editorial policy](docs/editorial.md), [validation](docs/validation.md) and the original [product specification](docs/product-spec.md).

## Security baseline

- Credentials, `.env` files, source caches, generated drafts, production exports and answer keys stay out of Git.
- Only synthetic fixture answers may appear in source control.
- Hosted identity comes from Sites dispatch. Never expose a development server directly to the Internet.
- The server owns grading, locks, attempt eligibility and UTC timestamps.
- Production content is stored in D1 and is not bundled into browser assets.

The source scanner catches common credential formats and researched edition JSON. It supplements careful review; it is not a guarantee against every secret format or renamed production export.
