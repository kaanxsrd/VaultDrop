# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately to the address in `/.well-known/security.txt` of the deployment (configured via `SECURITY_EMAIL`), or through GitHub's private vulnerability reporting for this repository. Do not open public issues for security problems.

Include: affected version/commit, a description, reproduction steps, and impact. Never include real secret links or contents.

We aim to acknowledge reports within 3 business days and to agree on a disclosure timeline with you. Please avoid privacy violations, data destruction and service degradation while testing; only test against accounts and secrets you own.

## Scope

In scope: the VaultDrop web application, REST API, CLI and their cryptographic design (`docs/encryption.md`). Out of scope: denial of service through volume, social engineering, and issues requiring a compromised end-user device.

## Security properties we treat as critical

- Plaintext, link keys or passphrases reaching the server, logs, analytics or third parties
- A one-time secret being successfully redeemed more than once
- A wrong passphrase consuming a secret
- Access to another tenant's secret metadata, keys or webhooks
- Bypass of expiry, revocation, rate limits or plan entitlements
