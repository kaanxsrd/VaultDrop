<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.webp">
  <img alt="VaultDrop: Share secrets. Leave no trace." src="docs/assets/banner-light.webp" width="100%">
</picture>

<br>

**Share passwords, API keys and private notes through end-to-end encrypted links that open once and then disappear.**

<br>

[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?style=flat-square&logo=bun&logoColor=black)](https://bun.sh)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle-4169e1?style=flat-square&logo=postgresql&logoColor=white)](https://orm.drizzle.team)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind-4-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
<br>
[![AES-256-GCM](https://img.shields.io/badge/AES--256--GCM-in_the_browser-0b9472?style=flat-square&logo=letsencrypt&logoColor=white)](docs/encryption.md)
[![Zero-knowledge](https://img.shields.io/badge/server-zero--knowledge-0b9472?style=flat-square&logo=shieldsdotio&logoColor=white)](docs/threat-model.md)
[![Biome](https://img.shields.io/badge/lint-Biome-60a5fa?style=flat-square&logo=biome&logoColor=white)](https://biomejs.dev)
[![Playwright](https://img.shields.io/badge/E2E-Playwright-2ead33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev)
[![npm CLI](https://img.shields.io/badge/CLI-vaultdrop-cb3837?style=flat-square&logo=npm&logoColor=white)](cli/README.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-0b9472?style=flat-square)](LICENSE)

**[Website](https://vaultdrop.vante.app)** ·
**[How it works](https://vaultdrop.vante.app/how-it-works)** ·
**[API docs](https://vaultdrop.vante.app/docs)** ·
**[Encryption](docs/encryption.md)** ·
**[CLI](cli/README.md)** ·
**[Security](SECURITY.md)**

</div>

<br>

<img alt="VaultDrop home page: the secret composer next to the 'Share secrets. Leave no trace.' headline" src="docs/assets/screenshot-home.webp" width="100%">

<table>
  <tr>
    <td width="60%"><img alt="How it works: encrypt in your browser, share one link, read once then gone" src="docs/assets/screenshot-how.webp"></td>
    <td width="40%"><img alt="A revealed secret, already deleted from the server" src="docs/assets/screenshot-reveal.webp"></td>
  </tr>
  <tr>
    <td align="center"><sub>Three steps. Zero copies left behind.</sub></td>
    <td align="center"><sub>Revealed once, and already deleted server-side.</sub></td>
  </tr>
</table>

## Features

<table>
  <tr>
    <td width="50%" valign="top">

**Zero-knowledge encryption**<br>
Secrets are sealed in the browser (or the CLI) with AES-256-GCM. The key travels only in the link's `#fragment`, so the server stores ciphertext it cannot read.

</td>
    <td width="50%" valign="top">

**Truly one-time links**<br>
One-time (or N-time) redemption that stays correct under concurrent requests: row lock, conditional update, and the ciphertext is deleted in the same transaction.

</td>
  </tr>
  <tr>
    <td valign="top">

**Optional passphrases**<br>
Argon2id-derived second factor. A wrong passphrase never consumes the secret; too many wrong attempts destroy it.

</td>
    <td valign="top">

**Private receipts**<br>
A receipt link to check whether a secret was read, or to destroy it before anyone does.

</td>
  </tr>
  <tr>
    <td valign="top">

**Optional accounts**<br>
Email verification, passkeys, TOTP 2FA, session management, organizations and a dashboard — none of it required to share a secret.

</td>
    <td valign="top">

**Built for developers**<br>
Versioned REST API with an OpenAPI spec, scoped hashed API keys, idempotency keys, signed webhooks and an [npm CLI](cli/README.md).

</td>
  </tr>
</table>

Stripe billing with centralized plan entitlements is available too, and stays off until it's configured.

## How the encryption works

```mermaid
sequenceDiagram
    autonumber
    participant S as Sender's browser
    participant V as VaultDrop server
    participant R as Recipient's browser
    S->>S: Random 256-bit link key → HKDF → AES-256-GCM encrypt
    S->>V: Ciphertext + SHA-256(auth proof)
    V-->>S: Secret id
    S-)R: Share link /s/{id}#35;{linkKey}
    Note over S,R: The #35;{linkKey} fragment is never sent to any server
    R->>V: Redeem with auth proof
    Note over V: Lock row, verify proof,<br/>delete ciphertext — one transaction
    V-->>R: Ciphertext, exactly once
    R->>R: Decrypt locally
```

The server never receives plaintext, link keys or passphrases. Details: [encryption design](docs/encryption.md) and [threat model](docs/threat-model.md).

## Quick start

Requires [Bun](https://bun.sh) ≥ 1.3, which is both the package manager and the runtime for the app, scripts and unit tests. No database server is needed: development uses an embedded PostgreSQL (PGlite) in `.data/pglite` that migrates itself.

```bash
bun install
cp .env.example .env     # optional in development; Bun loads .env automatically
bun run dev              # http://localhost:3000
```

<details>
<summary><b>Seed data, email and real PostgreSQL</b></summary>

<br>

```bash
bun run db:seed          # admin@vaultdrop.local (Pro, admin) and member@vaultdrop.local; password: vaultdrop-dev-password
```

Without SMTP, emails (verification, password reset) are written to `.data/outbox.log`.

To develop against real PostgreSQL and Redis instead:

```bash
docker compose up -d postgres redis
export DATABASE_URL=postgres://vaultdrop:vaultdrop@localhost:5432/vaultdrop REDIS_URL=redis://localhost:6379
bun run db:migrate && bun run dev
```

</details>

## Commands

| Command                                                 | Purpose                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `bun run dev` / `bun run build` / `bun run start`       | Develop, build, serve (Next.js on the Bun runtime)                                                                             |
| `bun run check`                                         | Biome (lint + format + import order), typecheck and tests                                                                      |
| `bun run lint` / `bun run format` / `bun run check:fix` | Biome lint, format, or apply all safe fixes                                                                                    |
| `bun run typecheck`                                     | TypeScript                                                                                                                     |
| `bun run test`                                          | Unit + integration tests (Vitest on Bun; in-memory PGlite; set `TEST_DATABASE_URL` for real PostgreSQL)                        |
| `bun run test:e2e`                                      | Playwright against a production build (`bun run build` first; `bunx playwright install chromium` once). **Needs Node.js ≥ 22** |
| `bun run db:generate` / `db:migrate` / `db:seed`        | Schema migrations and dev data                                                                                                 |
| `bun run jobs:run [--loop]`                             | Trigger background jobs over HTTP (when `JOBS_IN_PROCESS=false`)                                                               |
| `bun run loadtest --url <server>`                       | Load + race test (server needs `TRUST_PROXY=true`)                                                                             |

> [!NOTE]
> **Why E2E needs Node:** Playwright's test runner does not support the Bun runtime (under Bun it fails to transpile TypeScript spec files). The E2E suite therefore runs the _runner_ on Node, while the app under test is still started with `bun --bun next start`, so the product itself is exercised on Bun. Everything else needs only Bun.

## CLI

Share secrets straight from your terminal or CI. The package is [`vaultdrop`](https://www.npmjs.com/package/vaultdrop) on npm, with its source in [`cli/`](cli/README.md):

```bash
npm install -g vaultdrop
echo "$TOKEN" | vaultdrop --expires 1h                       # uses https://vaultdrop.vante.app
echo "$TOKEN" | vaultdrop --server http://localhost:3000     # against a local dev server
vaultdrop open "https://vaultdrop.vante.app/s/<id>#<key>"
```

The CLI and the web app share the same envelope format, and interoperability tests in `tests/unit` keep them in sync. To release a new version, see [Publishing the CLI to npm](docs/publishing-cli.md).

## Documentation

| Guide                                                                      | What's inside                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [Architecture & decisions](docs/architecture.md)                           | Stack, data model, redemption state machine                |
| [Encryption design](docs/encryption.md)                                    | Envelope v1, key derivation, padding                       |
| [Threat model](docs/threat-model.md)                                       | What VaultDrop protects against, and what it can't         |
| [Deployment, backups & operations](docs/deployment.md)                     | Docker, Vercel + Neon, jobs, backups                       |
| [Publishing the CLI to npm](docs/publishing-cli.md)                        | First publish, trusted publishing, releases                |
| [Implementation status & known limitations](docs/implementation-status.md) | What's done and what isn't                                 |
| API reference                                                              | `/docs`, `/docs/api` and `/api/v1/openapi.json` in the app |
| [Security policy](SECURITY.md)                                             | How to report a vulnerability                              |

## License

[MIT](LICENSE) © Vante — this covers the whole repository, including the web app and the [CLI](cli/).

<div align="center">
<br>
<sub>Built with care for things that should only be read once.</sub>
</div>
