# Architecture

```
Browser / CLI ──HTTPS──▶ reverse proxy ──▶ Next.js (App Router, Node runtime)
   │ encrypt/decrypt                          ├─ proxy.ts          per-request CSP nonce
   │ (Web Crypto, Argon2id)                   ├─ app/              pages (RSC), route handlers (/api/v1, /api/auth)
   └─ key in #fragment                        ├─ server/           domain services (no React)
                                              │    secrets/        lifecycle + queries
                                              │    auth/           Better Auth config, session helpers
                                              │    http/           route wrapper, actor resolution, CSRF
                                              │    jobs/           scheduler + runner
                                              │    db/             Drizzle schema + client
                                              └─ instrumentation   migrate (embedded DB) + start scheduler
                                                         │
                                       PostgreSQL ◀──────┤──────▶ Redis (optional: rate limits)
                                                         ├──────▶ SMTP (auth emails)
                                                         └──────▶ Stripe (billing, optional)
```

## Layers

| Path                         | Responsibility                                                              |
| ---------------------------- | --------------------------------------------------------------------------- |
| `src/lib/crypto`             | Envelope encryption — isomorphic, no server imports                         |
| `src/lib/validation`         | Zod schemas shared by API and UI                                            |
| `src/config/plans.ts`        | Plans, prices, limits (single source of truth)                              |
| `src/server/secrets`         | State machine, redemption transaction, cleanup, listing                     |
| `src/server/entitlements.ts` | Plan resolution, atomic quota counters                                      |
| `src/server/ratelimit.ts`    | Fixed-window limiter (Redis or Postgres)                                    |
| `src/server/events.ts`       | Transactional outbox for webhooks, notifications, audit                     |
| `src/server/webhooks.ts`     | Endpoint management, signing, leased delivery with backoff                  |
| `src/server/billing.ts`      | Stripe checkout/portal, verified webhook handling                           |
| `src/server/http`            | Route wrapper (errors, request ids, logging), actor resolution, CSRF checks |
| `src/app/api/v1`             | Versioned REST API                                                          |
| `src/components`             | Design system and feature UI                                                |

## Data model (see `src/server/db/schema/`)

- `secrets` — metadata and state; `secret_payloads` — ciphertext only, 1:1, `ON DELETE CASCADE`. Payload rows are deleted whenever a secret leaves `active`.
- Better Auth tables: `users`, `sessions`, `accounts`, `verifications`, `two_factors`, `passkeys`, `organizations`, `members`, `invitations`.
- `api_keys` (SHA-256 token hashes), `idempotency_keys`, `rate_limits`, `usage_counters`, `subscriptions`, `webhook_endpoints`, `webhook_deliveries`, `audit_events`, `notifications`, `user_settings`, `job_runs`.
- Deleting a user cascades to their secrets, payloads, keys, webhooks, sessions and settings; audit events keep `user_id = NULL`.

## Secret state machine

```
            redeem (views left)
             ┌───────┐
             ▼       │
 create ─▶ active ───┴── redeem (last view) ──▶ consumed
             │
             ├── now ≥ expires_at (on access or cleanup) ──▶ expired
             └── burn / failed attempts ≥ max ─────────────▶ revoked
```

Terminal states never transition again: every write is `UPDATE … WHERE state = 'active'`. **The one-time guarantee takes effect at the commit of the redemption transaction**, which locks the row, re-checks state and expiry, verifies the proof, conditionally updates state/view count, and deletes (final view) or reads the payload. Any error before commit rolls back and leaves the secret redeemable; a failure after commit (e.g. the HTTP response is lost) means the secret is gone — VaultDrop fails closed rather than risk a second disclosure.

## Background jobs

| Job                  | Interval | Purpose                                                                      |
| -------------------- | -------- | ---------------------------------------------------------------------------- |
| `expire-secrets`     | 60 s     | `active` → `expired` for overdue rows, delete payloads (SKIP LOCKED batches) |
| `deliver-webhooks`   | 30 s     | Lease due deliveries, sign and POST, back off on failure                     |
| `purge-metadata`     | 1 h      | Delete terminal secret metadata after retention (24 h anonymous, 30 d owned) |
| `purge-housekeeping` | 1 h      | Expired rate-limit rows, idempotency keys > 24 h, job runs > 7 d             |

All jobs are idempotent and safe to run concurrently on multiple instances. Each attempt is recorded in `job_runs` with up to 3 retries and exponential backoff; `/api/health`, `/status` and `/admin` report staleness. Expiry correctness does **not** depend on the jobs — it is enforced on every read.

## Architectural decisions

1. **Next.js route handlers as the backend.** One deployable; no separate API server. Trade-off: no socket-level client IP, so rate limiting relies on a trusted reverse proxy (`TRUST_PROXY`).
2. **Drizzle with dual drivers (postgres-js / PGlite).** PGlite (real Postgres compiled to WASM) gives a zero-dependency dev setup and real-SQL tests. Trade-off: PGlite is single-connection, so true parallel concurrency is verified only by CI against real PostgreSQL. Production refuses to start on PGlite unless explicitly overridden for local smoke tests.
3. **Postgres-backed rate limiting with optional Redis.** Correct across instances with no extra infrastructure; Redis offloads hot counters. Correctness of the one-time guarantee never depends on Redis.
4. **Passphrase proof instead of server-side passphrase check.** See `encryption.md`; gives "wrong passphrase doesn't consume" without the server learning the passphrase.
5. **Derived receipt tokens.** HMAC of the secret id, so idempotent replays can return the same token without storing it.
6. **Transactional outbox for events.** Webhook deliveries and notifications are inserted in the same transaction as the state change.
7. **Own session-listing endpoint.** Better Auth's `listSessions` returns raw session tokens to the browser; VaultDrop exposes sessions by opaque id only.
8. **Motion for marketing animation; no TanStack Query.** Scroll reveals and staggered entrances use Motion via `LazyMotion` + `m` (features load after first paint) with `reducedMotion="user"`; above-the-fold hero entrances are pure CSS so they never wait for JavaScript, and a `<noscript>` rule keeps reveal content visible without JS. Code blocks are highlighted on the server with Shiki (Catppuccin Mocha, JS regex engine) and converted to React elements — zero client JS and no `dangerouslySetInnerHTML`. Data fetching stays plain `fetch`; TanStack Query isn't justified by the current interactions.
9. **Nonce CSP ⇒ dynamic rendering.** Every HTML page is rendered per request so it can carry a fresh nonce. Trade-off: no static HTML caching of public pages.
10. **Bun as package manager and runtime; Biome for lint/format.** One fast tool for install, scripts (`.env` loading, TypeScript execution — no `tsx`/`dotenv`), Next.js dev/build/start (`bun --bun`) and Vitest. Biome replaces ESLint + Prettier (including Next/React rule domains, import ordering and Tailwind class sorting). Trade-offs: Bun applies only top-level `overrides`, so `esbuild` is pinned project-wide; Playwright's test runner does not run on Bun, so E2E uses Node for the runner only while the app under test runs on Bun.
