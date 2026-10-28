# Implementation status

Last updated: 2026-10-28 (session 2 — migrated from pnpm/ESLint/Prettier to Bun/Biome). Release candidate for the core product; several advanced features remain.

## Verification performed

Environment: Windows 11, Bun 1.4.2 (no Node.js on PATH except where noted), Chromium (Playwright 1.64). No PostgreSQL server, Redis or Docker daemon was available.

| Check                                                                                                                | Result                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `bunx biome check .` (lint + format + imports, 173 files)                                                            | Pass                                                                                  |
| `bun run typecheck`                                                                                                  | Pass                                                                                  |
| `bun run test` — 68 unit + integration tests, Vitest on the Bun runtime, in-memory PGlite                            | Pass                                                                                  |
| `bun run build` (production, Bun runtime)                                                                            | Pass — all HTML routes dynamic (nonce CSP)                                            |
| `bun run dev` smoke test (pages + API) on Bun                                                                        | Pass                                                                                  |
| `bun run test:e2e` — 37 Playwright tests, desktop + Pixel 7; app served by `bun --bun next start`, runner on Node 24 | Pass (2 skipped by design)                                                            |
| axe-core WCAG 2.2 A/AA scan on 5 key pages (desktop + mobile)                                                        | No serious/critical violations                                                        |
| `bun audit`                                                                                                          | No vulnerabilities (single `esbuild@0.28.2` via top-level override; verified on disk) |
| `bun run loadtest` on Bun — 200 secrets × 10 concurrent redemptions (2,000 requests)                                 | 0 duplicate successes, 0 lost secrets, rate limit enforced at exactly 20              |
| In-process job scheduler on Bun                                                                                      | All four jobs ran and reported healthy                                                |
| `bun run db:generate` / `db:migrate` / `db:seed` on Bun                                                              | Pass, idempotent                                                                      |

Not runnable on Bun: **Playwright's test runner** (fails to transpile TypeScript spec files under the Bun runtime — reproduced with single-line probes). E2E therefore needs Node ≥ 22 for the runner; CI installs it.

Load-test latencies (session 1 on Node: contended redeem p50/p95 501/599 ms; session 2 on Bun: 398/532 ms) were measured against the **embedded single-connection PGlite** on a laptop, which serialises every query. They are not representative of PostgreSQL in production; re-measure in staging.

## Production setup (vaultdrop.vante.app on Vercel, 2026-10-28)

- `.env.vercel` (gitignored, live secrets) holds the production config; import it into Vercel. It's intentionally not called `.env.production`, so local tools never auto-load it.
- Neon PostgreSQL 18.6 (AWS us-east-2): **schema migrated** (23 tables, 2 migrations). Database-level `statement_timeout=15s`, `idle_in_transaction_session_timeout=20s` and `lock_timeout=10s` were verified as enforced through the pooled endpoint. Neon's pooler ignores the per-connection startup parameters the app used to rely on.
- Microsoft 365 SMTP: STARTTLS login verified, and a real test email was sent through the app's `sendEmail()` path.
- Vercel: `vercel.json` pins region `cle1` (next to Neon) and runs a daily cron to `/api/internal/jobs`. With `JOBS_IN_PROCESS=false`, webhooks are delivered after each request via `after()`. Better Auth rate limits now live in PostgreSQL so they hold across serverless instances.
- Not yet done: creating the Vercel project, importing env vars, attaching the domain, and the first deploy and smoke test (see docs/deployment.md, "Vercel + Neon").

## Done and verified

- **Crypto**: AES-256-GCM + HKDF-SHA256 + Argon2id envelope, padding, tamper detection, NFKC passphrases, KDF bounds; interop with `node:crypto` and with the independent CLI implementation.
- **Secret lifecycle**: creation with server-side plan enforcement; status; redemption with row lock + conditional update; wrong-passphrase handling with attempt cap; multi-view; lazy expiry; burn via receipt token / owner / API key; cleanup that never reactivates; metadata retention purge; rollback on injected DB failure.
- **Web UI**: homepage + composer (templates, expiry presets + custom, passphrase + generator, views, labels, size meter, Ctrl+Enter, clear), share result (copy, QR, native share, receipt), recipient page (gate, passphrase, reveal, copy, hide, clear on leave, key stripped from URL), receipt page (status, destroy), all public pages, branded 404/error/loading states, light/dark themes, responsive navigation.
- **Security controls**: nonce CSP (no third-party origins — E2E asserted), HSTS, no-referrer, no-store/noindex on sensitive routes, CSRF origin checks, body size limits, uniform errors with request ids, log redaction (tested), pseudonymised rate-limit keys.
- **Accounts**: sign-up with email verification, sign-in, sign-out, password reset, session listing/revocation without exposing tokens, admin-only routes (E2E verified).
- **Dashboard**: overview, secrets (filter, search, sort, paginate, destroy), API keys, webhooks, notifications, usage & billing, security, settings, team — metadata only.
- **Developer platform**: REST v1, OpenAPI 3.1 + interactive explorer, scoped hashed API keys with live/test separation, idempotency keys, CLI, cURL/TypeScript docs, signed webhooks with retries/backoff, SSRF guards, transactional outbox.
- **Operations**: job runner with retries and health, `/api/health`, `/status`, admin console (stats, users, plan assignment, suspension, job runs, rate-limit pressure, audit log), Dockerfile, Compose, CI workflow, migrations, seed.

## Implemented but NOT verified end-to-end

| Item                                                                           | Why unverified                                                       | How to verify                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Real PostgreSQL concurrency (true parallel transactions)                       | No Postgres server here; PGlite serialises                           | CI job `integration-postgres` (`TEST_DATABASE_URL`) — not yet run |
| Redis rate-limit backend                                                       | No Redis here                                                        | Run with `REDIS_URL` + `bun run loadtest`                         |
| Docker image / Compose stack (`oven/bun` image; standalone `server.js` on Bun) | No Docker daemon                                                     | `docker compose --profile app up --build`                         |
| GitHub Actions workflow (gitleaks, CodeQL, Trivy)                              | Not executed                                                         | Push to GitHub                                                    |
| Stripe checkout, portal, subscription webhooks                                 | No Stripe keys; only signature verification is unit-tested           | Stripe test mode + `stripe listen`                                |
| Passkeys and TOTP 2FA                                                          | UI + Better Auth plugins wired and typechecked; not exercised in E2E | Playwright virtual authenticator; TOTP via an OTP library         |
| Organizations, invitations, role changes                                       | UI wired to Better Auth; not E2E-tested                              | Add E2E with two users                                            |
| Account deletion                                                               | Wired to Better Auth `deleteUser`; cascade relies on FKs             | Add E2E + DB assertion                                            |
| SMTP delivery                                                                  | Only the file outbox was exercised                                   | Configure `SMTP_URL` in staging                                   |
| Python and Go SDK examples                                                     | Interpreters unavailable; labelled as reference examples in /docs    | Port into CI as interop tests                                     |
| Lighthouse / Core Web Vitals targets                                           | Not measured                                                         | Lighthouse CI against staging                                     |

## Not implemented yet

- SSO (OIDC/SAML) and organization-level security policies.
- Incoming-secret request pages (recipient-generated public key; designed, not built).
- Custom domains and share-page branding (plan flag exists; no UI/rendering).
- Per-user metadata retention setting (`user_settings.metadata_retention_days` exists but the purge job uses fixed 24 h / 30 d).
- Feature-flag and limit editing in the admin UI (limits are code configuration in `src/config/plans.ts`).
- Email notifications (notifications are in-app only); HTML email templates.
- Per-seat quantity sync for Team subscriptions.
- Webhook endpoint "send test event" and secret rotation.
- IP allow-listing / recipient access restrictions beyond link + passphrase.

## Known limitations and residual risks

- Browser cryptography trusts the served JavaScript; a compromised origin could exfiltrate keys. No SRI pinning or signed client.
- `style-src 'unsafe-inline'` is allowed (inline style attributes).
- Better Auth's own rate limiter is in-memory per instance; VaultDrop's limiter is shared (Postgres/Redis).
- Client IPs depend on `TRUST_PROXY` and a proxy that overwrites `X-Forwarded-For`; without it all clients share one bucket.
- Webhook SSRF check has a DNS-rebinding window between resolution and connection.
- If the redeem response is lost after commit, the secret is gone (deliberate fail-closed design).
- Deleted ciphertext may persist in WAL, replicas and backups until recycled (see `docs/deployment.md`).
- Legal pages are templates that must be reviewed by counsel; pricing values are configuration placeholders.

## Next highest-priority tasks

1. Push to GitHub and get the CI workflow green, especially `integration-postgres` (true concurrency) and the container scan.
2. E2E coverage for passkeys (virtual authenticator), TOTP 2FA, organizations/invitations and account deletion.
3. Staging deployment with PostgreSQL, Redis, SMTP and Stripe test mode; run `bun run loadtest` and Lighthouse there.
4. Apply per-user retention settings in the purge job; add webhook test events.
5. Incoming-secret requests and share-page branding (Team plan).
