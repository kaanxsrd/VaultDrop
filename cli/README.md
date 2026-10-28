<div align="center">

<a href="https://vaultdrop.vante.app"><img alt="vaultdrop: share secrets from your terminal. Leave no trace." src="https://cdn.jsdelivr.net/npm/vaultdrop/assets/banner.webp" width="100%"></a>

<br>

**Share passwords, API keys and other secrets from the terminal through end-to-end encrypted links that self-destruct after one read.**

<br>

[![npm version](https://img.shields.io/npm/v/vaultdrop?style=flat-square&color=0b9472&logo=npm&logoColor=white)](https://www.npmjs.com/package/vaultdrop)
[![License: MIT](https://img.shields.io/badge/license-MIT-0b9472?style=flat-square)](https://www.npmjs.com/package/vaultdrop?activeTab=code)
[![Node.js 20.19+](https://img.shields.io/badge/node-%E2%89%A520.19-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Bun](https://img.shields.io/badge/works_with-Bun-f9f1e1?style=flat-square&logo=bun&logoColor=black)](https://bun.sh)
[![AES-256-GCM](https://img.shields.io/badge/AES--256--GCM-on_your_machine-0b9472?style=flat-square&logo=letsencrypt&logoColor=white)](https://vaultdrop.vante.app/security)
[![1 dependency](https://img.shields.io/badge/dependencies-1-0b9472?style=flat-square)](https://www.npmjs.com/package/@noble/hashes)

**[VaultDrop](https://vaultdrop.vante.app)** ·
**[Docs](https://vaultdrop.vante.app/docs#cli)** ·
**[How it works](https://vaultdrop.vante.app/how-it-works)** ·
**[Security](https://vaultdrop.vante.app/security)**

</div>

<br>

```bash
echo "$DB_PASSWORD" | npx vaultdrop --expires 1h
# https://vaultdrop.vante.app/s/Xk2pR7mQb9Lw4TzA1cVe0g#M3f9Qa…
```

> [!IMPORTANT]
> Your secret is encrypted **on your machine** before anything is sent. The decryption key is the part of the link after `#`, which never reaches the server.

## Install

```bash
npm install -g vaultdrop        # or: bun add -g vaultdrop
```

You can also run it without installing: `npx vaultdrop …` or `bunx vaultdrop …`. Requires Node.js 20.19+ or Bun.

## Usage

```bash
# Create a secret from stdin and print the share link
echo "s3cr3t" | vaultdrop
vaultdrop --expires 15m < api-key.txt

# Require a passphrase too (prompted; send it through a different channel)
vaultdrop --passphrase --views 3 < recovery-codes.txt

# Also get a private receipt link to check status or destroy it before it's read
printf '%s' "$TOKEN" | vaultdrop --receipt

# Open a secret (prints it to stdout; this consumes it)
vaultdrop open "https://vaultdrop.vante.app/s/Xk2p…#M3f9…"
```

### Options

| Option                         | Meaning                                                       | Default                       |
| ------------------------------ | ------------------------------------------------------------- | ----------------------------- |
| `-e, --expires <time>`         | Expiry: `15m`, `1h`, `7d` (maximum depends on your plan)      | `24h`                         |
| `--views <n>`                  | How many times the link can be opened (1–100, plan-dependent) | `1`                           |
| `-p, --passphrase`             | Also require a passphrase                                     | off                           |
| `--label <text>`               | Private label for your dashboard (needs an API key)           | none                          |
| `--receipt`                    | Print a private receipt link to stderr                        | off                           |
| `--server <url>`               | VaultDrop server                                              | `https://vaultdrop.vante.app` |
| `-h, --help` / `-v, --version` | Help / version                                                |                               |

> [!TIP]
> The share link is the only thing written to **stdout**, so `LINK=$(… | vaultdrop)` works in scripts. Messages and the receipt go to stderr. Exit codes: `0` success, `1` error, `2` usage error.

## Environment

| Variable               | Purpose                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `VAULTDROP_API_KEY`    | API key (`vd_live_…` or `vd_test_…`) for higher limits, labels and dashboard history. Create one at VaultDrop → Dashboard → API keys. |
| `VAULTDROP_SERVER`     | Server URL, e.g. a self-hosted instance (overridden by `--server`).                                                                   |
| `VAULTDROP_PASSPHRASE` | Passphrase for non-interactive use (CI).                                                                                              |

## CI example (GitHub Actions)

```yaml
- name: Share the generated password with on-call
  env:
    VAULTDROP_API_KEY: ${{ secrets.VAULTDROP_API_KEY }}
  run: |
    LINK=$(printf '%s' "$GENERATED_PASSWORD" | npx -y vaultdrop --expires 2h)
    echo "::add-mask::$LINK"
```

## Programmatic use

```js
import { seal, deriveKeys, open } from "vaultdrop";

const sealed = await seal("hunter2"); // { envelope, kdf, verifier, linkKey }
// POST { envelope, kdf, verifier, expiresIn } to /api/v1/secrets, then share `<shareUrlBase>#<linkKey>`.
```

TypeScript declarations are included.

## Security

|                         |                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Encryption**          | AES-256-GCM with a fresh 256-bit key per secret, keys separated with HKDF-SHA256, and an optional Argon2id passphrase. Plaintext is padded to 256-byte buckets. |
| **Zero-knowledge**      | The server stores only ciphertext and a one-way verifier. A wrong passphrase never consumes the secret.                                                         |
| **Hostile-server safe** | Argon2 parameters received from a server are bounds-checked, so a malicious server can't make the CLI exhaust memory.                                           |
| **Design**              | Full write-up at <https://vaultdrop.vante.app/security>. Report vulnerabilities to contact@vante.app.                                                           |

## License

[MIT](https://www.npmjs.com/package/vaultdrop?activeTab=code) © Vante

<div align="center">
<br>
<sub>Built with care for things that should only be read once.</sub>
</div>
