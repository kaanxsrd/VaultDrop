# Encryption design (envelope v1)

Status: implemented in `src/lib/crypto/envelope.ts` (browser + server) and independently in `cli/vaultdrop.mjs`. Both are tested against each other and against Node's `node:crypto` (`tests/unit/crypto.test.ts`, `tests/unit/security.test.ts`).

## Goals

1. The server never receives plaintext, link keys or passphrases (zero-knowledge storage).
2. A wrong passphrase must **not** consume a one-time secret, so the server needs a way to reject wrong passphrases **without learning them**.
3. Knowing a secret's identifier alone (from logs, a mistyped link, enumeration) must not allow anyone to consume or burn it.
4. Only standard, reviewed primitives. No custom ciphers.

## Construction

```
linkKey   = CSPRNG(32 bytes)                                      — in URL fragment only
pwKey     = Argon2id(NFKC(passphrase), salt=CSPRNG(16), t=2, m=19456 KiB, p=1, len=32)   — optional
ikm       = linkKey ‖ pwKey            (or linkKey alone)
encKey    = HKDF-SHA256(ikm, salt="vaultdrop/v1/hkdf-salt", info="vaultdrop/v1/enc",  L=32)
authProof = HKDF-SHA256(ikm, salt="vaultdrop/v1/hkdf-salt", info="vaultdrop/v1/auth", L=32)
verifier  = SHA-256(authProof)
padded    = uint32_be(len) ‖ utf8(plaintext) ‖ 0x00… (to a multiple of 256 bytes)
ct        = AES-256-GCM(encKey, iv=CSPRNG(12), aad="vaultdrop/v1", padded)   — 128-bit tag
```

Stored server-side: `{ v: 1, iv, ct }`, `kdf` (`alg`, `salt`, `t`, `m`, `p` or `null`), `verifier`.
Share link: `https://host/s/<id>#<base64url(linkKey)>`.

### Redemption protocol

1. Recipient's browser reads `linkKey` from `location.hash` (never sent in HTTP requests).
2. `GET /api/v1/secrets/:id/status` → state and `kdf` params (does not consume).
3. Browser derives `encKey` and `authProof` (prompting for the passphrase if `kdf` is non-null).
4. `POST /api/v1/secrets/:id/redeem { proof: authProof }`.
5. Server computes `SHA-256(proof)` and compares with `verifier` in constant time:
   - mismatch → `failed_attempts += 1` (not consumed); at `max_failed_attempts` (default 10) the secret is revoked and the payload deleted;
   - match → the view is consumed and the envelope returned in the same transaction.
6. Browser decrypts with `encKey`; GCM authentication rejects any tampering.

## Security analysis

- **Key independence.** HKDF with distinct `info` labels yields computationally independent `encKey` and `authProof`. The server learns `authProof` at redemption; it reveals nothing about `encKey`. The verifier is a hash of `authProof`, so a database dump does not even yield the proof.
- **Database disclosure.** An attacker with the database has `ct`, `iv`, `kdf`, `verifier`. Without the 256-bit `linkKey`, neither decryption nor an offline passphrase search is possible (every candidate passphrase still needs the unknown `linkKey`).
- **Link interception (no passphrase).** The link is the bearer credential. Whoever opens it first consumes it; the sender's receipt shows the open time.
- **Link interception (with passphrase).** An attacker holding the link must guess online. Guesses are limited by per-secret rate limits (10/min) and destroyed after `max_failed_attempts`. An attacker holding **both** the link and a database copy could brute-force the passphrase offline against the verifier at Argon2id cost; this is why passphrases are a second factor, not a replacement for the link's secrecy.
- **Identifier-only attackers** cannot burn secrets: redemption requires `authProof`, which requires `linkKey`.
- **Nonces.** Each secret has a fresh random key, so the 96-bit random IV is used exactly once per key.
- **Length hiding.** Padding to 256-byte buckets limits size leakage to the bucket.
- **Argon2id parameters** are client-chosen but validated server-side within bounds (`t` 2–8, `m` 19 MiB–128 MiB, `p` 1–4) so a malicious sender cannot make recipients' browsers hang or downgrade below the OWASP minimum.
- **Unicode.** Passphrases are NFKC-normalised so the same passphrase typed on different platforms derives the same key.

## What is _not_ protected

- A compromised server could serve malicious JavaScript that exfiltrates keys from the browser. Mitigations: strict nonce-based CSP, no third-party scripts, and the CLI as an out-of-band client. Subresource-integrity pinning of the web client is not implemented.
- Malware or extensions on either endpoint, screenshots, copy/paste.
- Metadata: timestamps, view counts, size bucket, passphrase presence, IP-based rate limiting.

## Server-side cryptography (separate from secrets)

| Purpose                 | Construction                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Account passwords       | Argon2id (19 MiB, t=2, p=1) via `@node-rs/argon2`                                           |
| API keys                | 256-bit random tokens; stored as SHA-256 (fast hash is appropriate for full-entropy tokens) |
| Receipt tokens          | HMAC-SHA256(HKDF(APP_SECRET, "receipt"), secretId) — derived, not stored                    |
| Webhook signing secrets | AES-256-GCM at rest with an HKDF subkey of APP_SECRET                                       |
| Webhook signatures      | HMAC-SHA256(secret, `t.body`), 5-minute replay window                                       |
| Rate-limit keys         | HMAC-SHA256 pseudonyms of client IPs, truncated                                             |
| Sessions                | Better Auth (signed, HTTP-only, SameSite=Lax cookies; DB-backed, revocable)                 |

## Versioning

`envelope.v` and the HKDF labels carry the version. A future v2 (e.g. different KDF defaults or XChaCha20-Poly1305) can be added alongside v1 without breaking existing links.
