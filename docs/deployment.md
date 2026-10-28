# Deployment

## Requirements

- Bun ≥ 1.3 (tested on 1.4.2), or Docker (image based on `oven/bun:1.4.2-alpine`), or Vercel (see below).
- PostgreSQL ≥ 15 (tested schema on PGlite 0.5 / Postgres 17 semantics; CI runs PostgreSQL 17).
- A TLS-terminating reverse proxy that overwrites `X-Forwarded-For`.
- SMTP for account emails. Optional: Redis 7, Stripe.

| Feature                                | External service                    |
| -------------------------------------- | ----------------------------------- |
| Anonymous sharing, receipts            | PostgreSQL only                     |
| Accounts (sign-up, reset, invitations) | SMTP                                |
| Rate limiting                          | PostgreSQL (default) or Redis       |
| Paid plans                             | Stripe (checkout, portal, webhooks) |
| Webhooks                               | Outbound HTTPS from the app         |

## Configuration

Copy `.env.example`. Production refuses to start without `BETTER_AUTH_SECRET`, `APP_SECRET` and `DATABASE_URL`. Generate secrets with `openssl rand -base64 48`; store them in your platform's secret manager, not in the image. Rotating `APP_SECRET` invalidates outstanding receipt links and makes stored webhook signing secrets unreadable (recreate endpoints); rotating `BETTER_AUTH_SECRET` signs everyone out.

## Docker Compose

```bash
cp .env.example .env            # fill in secrets, SMTP, APP_URL
docker compose --profile app up -d --build
```

This starts PostgreSQL, Redis, runs migrations (`migrate` service) and then the app on `127.0.0.1:3000` with a read-only root filesystem, dropped capabilities and a health check.

## Vercel + Neon (production: vaultdrop.vante.app)

The production configuration lives in `.env.vercel` (gitignored, contains live secrets). It is deliberately **not** named `.env.production`: Next.js and Bun auto-load that name in production mode, which would let a local `next start` or the E2E suite connect to the production database and send real email. Load it explicitly with `--env-file` when you need it.

1. **Migrate the database once, from a trusted machine** (repeat after every schema change, before deploying):

   ```bash
   bun --env-file=.env.vercel run db:migrate
   ```

   This uses `DATABASE_URL_UNPOOLED` (Neon's direct endpoint) and then sets database-level defaults: `statement_timeout = 15s`, `idle_in_transaction_session_timeout = 20s`, `lock_timeout = 10s`. They must be set on the database because Neon's pooler ignores per-connection startup parameters.

2. **Create the Vercel project** from the Git repository. The framework is detected as Next.js. `bun.lock` makes Vercel install with Bun, and the build runs `bun run build`.
3. **Environment variables:** Project → Settings → Environment Variables → _Import .env_ → select `.env.vercel`, scope **Production**. Don't add `NODE_ENV`; Vercel sets it.
4. **Domain:** add `vaultdrop.vante.app` in Project → Domains and create the CNAME it asks for. `APP_URL` must match it exactly, because passkeys, cookies and CSRF checks depend on it.
5. **Region:** `vercel.json` pins functions to `cle1` (Cleveland), the same AWS region as the Neon database (us-east-2).
6. **Background jobs:** `JOBS_IN_PROCESS=false`. Vercel Cron calls `GET /api/internal/jobs` daily (`vercel.json`), authenticated by `CRON_SECRET`. That schedule works on every plan. Webhooks are also delivered right after each request via Next's `after()`, and expiry is enforced on every read, so a once-a-day cron only tidies storage. On Vercel Pro you can tighten it (e.g. `*/15 * * * *`).
7. **Rate limiting:** application limits and Better Auth's sign-in limits are stored in PostgreSQL (`rate_limits`, `auth_rate_limits`), so they hold across serverless instances. `TRUST_PROXY=true` is correct on Vercel, whose edge overwrites `X-Forwarded-For`.
8. **Email:** Microsoft 365 SMTP with STARTTLS required (port 587). The mailbox must have _Authenticated SMTP_ enabled, and `EMAIL_FROM` must be an address it may send as. Microsoft is retiring Basic authentication for SMTP AUTH. If sending starts failing with authentication errors, switch to OAuth2 or a transactional email provider; only the `SMTP_*` variables change.
9. **Smoke test** after the first deploy: `GET /api/health` should return `{"status":"ok"}`. Then create and open a secret, and sign up with `contact@vante.app` to receive the verification email. That address is in `ADMIN_EMAILS`, so it becomes the admin.

**Where data lives:** database in Neon on AWS us-east-2 (Ohio), functions in Vercel `cle1`, logs in Vercel, email through Microsoft 365. Document Neon's backup and point-in-time-restore retention before making any residency or deletion claims.

## Reverse proxy (Caddy example)

```
vaultdrop.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000 {
    header_up X-Forwarded-For {remote_host}   # overwrite, never append client-supplied values
  }
  log {
    # Fragments are never sent by browsers; still avoid logging query strings.
    format filter { request>uri query { delete * } }
  }
}
```

Set `TRUST_PROXY=true` only when the proxy overwrites `X-Forwarded-For`. VaultDrop uses the right-most entry.

## Migrations

- Generate after schema changes: `bun run db:generate` (commit the SQL in `drizzle/`). CI fails if the schema and migrations drift.
- Apply: `bun run db:migrate` (or the `migrate` container) **before** rolling out new app versions.
- Write expand/contract migrations: add nullable columns / new tables first, deploy code that writes both, backfill, then remove old columns in a later release. Never rename or drop in the same release that stops using a column.
- Rollback: application rollback is safe as long as migrations were additive. Drizzle has no automatic down migrations — for a destructive change, write the reverse SQL in advance and test it on a staging snapshot.

## Background jobs

Default `JOBS_IN_PROCESS=true` runs the scheduler in each web instance (jobs are idempotent and lock-free). For serverless or many replicas set `JOBS_IN_PROCESS=false` and trigger `POST /api/internal/jobs` with `Authorization: Bearer $CRON_SECRET` every minute (`bun run jobs:run --loop`, a Kubernetes CronJob, or your platform's cron). Alert if `/api/health` reports a job as `healthy: false`.

## Monitoring & alerting

- Liveness/readiness: `GET /api/health` (checks the database; returns 503 when degraded).
- Logs: JSON on stdout (pino) with `requestId`, method, sanitized path, status and latency. Ship them to your log platform; alert on 5xx rate, p95 latency of `/api/v1/secrets/:id/redeem`, and `job attempt failed` messages.
- `/status` shows live checks for humans; set `STATUS_PAGE_URL` to link an external incident page. Do not publish fabricated uptime figures.

## Backups and deletion guarantees

- Take PostgreSQL base backups + WAL archiving (e.g. pgBackRest, managed PITR). Encrypt backups and restrict access.
- Deleted payload rows can persist in WAL, replicas, dead tuples and backups until they are recycled. These contain ciphertext only. Keep backup retention as short as your recovery objectives allow (e.g. 7–14 days) and document it in your privacy policy.
- Restoring a backup can resurrect secrets that were consumed after the backup was taken. After any restore, run `UPDATE secrets SET state='expired', expired_at=now() WHERE state='active' AND created_at < '<backup time>'; DELETE FROM secret_payloads WHERE secret_id IN (SELECT id FROM secrets WHERE state <> 'active');` to fail closed, then announce that links created before the incident must be re-shared.

## Staging → production

1. PR → CI (lint, types, unit/integration on PGlite and PostgreSQL, E2E, gitleaks, audit, CodeQL, Trivy).
2. Merge → build image once, tag with the commit SHA.
3. Deploy to staging with its own database and Stripe test keys; run migrations; smoke-test (`bun run loadtest --url https://staging…`).
4. Promote the same image to production; run migrations; deploy; watch error rate and health for 15 minutes; roll back by redeploying the previous image tag.

## Data residency

Configuring a deployment region does not by itself guarantee residency. Document where the primary database, replicas, backups, logs, email provider and Stripe process data before making residency claims.
