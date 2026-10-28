import Link from "next/link";
import { PageHeader } from "@/components/site/marketing";

export const metadata = {
  title: "Security",
  description: "VaultDrop's encryption design, threat model, guarantees and limitations.",
};

export default function SecurityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="Security architecture"
        description="What VaultDrop guarantees, how, and — just as important — what it does not. No certifications are claimed here; this page describes the system as built."
      />
      <article className="container-page prose-vd max-w-3xl py-14">
        <h2>Summary</h2>
        <ul>
          <li>
            <strong>End-to-end encryption.</strong> Secrets are encrypted in the sender&apos;s
            browser with AES-256-GCM and decrypted in the recipient&apos;s browser. The key travels
            only in the link&apos;s URL fragment, which browsers do not send to servers.
          </li>
          <li>
            <strong>Zero-knowledge storage.</strong> The server stores ciphertext, a random IV, KDF
            parameters and a one-way verifier. It never receives plaintext, link keys or
            passphrases, and cannot decrypt what it stores.
          </li>
          <li>
            <strong>Exactly-once redemption.</strong> Opening a one-time secret locks its row,
            checks state and expiry, marks it consumed and deletes the ciphertext in a single
            database transaction. Concurrent requests cannot both succeed.
          </li>
          <li>
            <strong>Wrong passphrases don&apos;t consume secrets.</strong> The server can check a
            passphrase-derived proof without learning the passphrase. After 10 failed attempts
            (configurable 3–20) the secret is destroyed to stop online guessing.
          </li>
        </ul>

        <h2>Cryptographic design</h2>
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>Construction</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Link key</td>
              <td>
                32 bytes from the browser&apos;s CSPRNG (crypto.getRandomValues), unique per secret
              </td>
            </tr>
            <tr>
              <td>Passphrase stretching</td>
              <td>
                Argon2id, 19 MiB memory, 2 iterations, 1 lane, 16-byte random salt (parameters
                stored per secret, bounded server-side)
              </td>
            </tr>
            <tr>
              <td>Key derivation</td>
              <td>
                HKDF-SHA256 over link key ‖ Argon2id output, with distinct info labels for the
                encryption key and the redemption proof
              </td>
            </tr>
            <tr>
              <td>Encryption</td>
              <td>
                AES-256-GCM, 96-bit random IV, 128-bit tag, fixed associated data; plaintext padded
                to 256-byte buckets
              </td>
            </tr>
            <tr>
              <td>Redemption proof</td>
              <td>
                Server stores SHA-256(proof); the recipient sends the proof; comparison is
                constant-time
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          All primitives come from the browser&apos;s Web Crypto API, except Argon2id, which uses
          the audited <code>@noble/hashes</code> library. No custom ciphers are used. The full
          design and its analysis are in <code>docs/encryption.md</code> in the repository.
        </p>

        <h2>What the server can see</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Visible to VaultDrop?</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Secret content</td>
              <td>No — ciphertext only</td>
            </tr>
            <tr>
              <td>Link key, passphrase</td>
              <td>No</td>
            </tr>
            <tr>
              <td>Approximate size</td>
              <td>Yes, rounded up to 256 bytes</td>
            </tr>
            <tr>
              <td>Creation, expiry, open and destroy times; view count</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>Whether a passphrase is required</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>Private labels (signed-in users)</td>
              <td>Yes — labels are not encrypted; never put secrets in them</td>
            </tr>
            <tr>
              <td>IP addresses</td>
              <td>
                Used transiently for rate limiting as keyed pseudonyms; not stored raw by VaultDrop.
                Session records keep the sign-in IP for your security page.
              </td>
            </tr>
          </tbody>
        </table>

        <h2>Threat model</h2>
        <h3>Database or backup disclosure</h3>
        <p>
          An attacker with a full database copy gets ciphertext without keys. Passphrase-protected
          secrets additionally require the link key before any guessing is possible.
        </p>
        <h3>Network interception</h3>
        <p>
          Production deployments must use HTTPS with HSTS. Even a TLS-terminating proxy sees only
          ciphertext, because keys stay in the URL fragment.
        </p>
        <h3>Enumeration and brute force</h3>
        <p>
          Identifiers are 128-bit random. Redemption requires a proof derived from the 256-bit link
          key. Requests are rate-limited per client and per secret, and failed proofs are capped per
          secret.
        </p>
        <h3>Race conditions and replay</h3>
        <p>
          Redemption uses a row lock plus a conditional update on the observed state and view count.
          A replayed proof after consumption receives &quot;already opened&quot;. Tests run 25
          concurrent redemptions and assert exactly one success.
        </p>
        <h3>Cross-site scripting and CSRF</h3>
        <p>
          A per-request nonce-based Content Security Policy allows only our own scripts; no
          third-party scripts, fonts or analytics are loaded. Cookie-authenticated state changes
          require a same-origin request. Session cookies are HTTP-only and SameSite=Lax.
        </p>
        <h3>Accidental logging</h3>
        <p>
          Structured logs redact sensitive fields, strip URL fragments and replace secret
          identifiers in paths. Ciphertext, proofs, keys and tokens are never logged by design.
        </p>
        <h3>Insider access</h3>
        <p>
          Operators with database access still cannot decrypt secrets. The admin area has no
          capability to read secret contents or recover destroyed ones.
        </p>

        <h2>Deletion and its limits</h2>
        <p>
          The encrypted payload row is deleted in the same transaction that consumes, expires or
          destroys a secret. PostgreSQL may retain deleted data in free pages, the write-ahead log,
          replicas and backups until those are recycled; backups are kept according to the
          operator&apos;s retention policy. Because that data is ciphertext without keys, residual
          copies are not readable — but we do not claim instantaneous physical erasure everywhere.
        </p>

        <h2>Known limitations</h2>
        <ul>
          <li>
            Anyone who obtains the full link (and passphrase, if any) before the intended recipient
            can open the secret. The receipt shows when it was opened.
          </li>
          <li>
            Browser-based cryptography depends on the integrity of the code served to you. A
            compromised server could serve malicious JavaScript; the CLI avoids this risk.
          </li>
          <li>
            Screenshots, copying and malware on the recipient&apos;s device are outside
            VaultDrop&apos;s control.
          </li>
          <li>Ciphertext size reveals the secret&apos;s length to within 256 bytes.</li>
        </ul>

        <h2>Reporting a vulnerability</h2>
        <p>
          Please report security issues privately — see the{" "}
          <Link href="/contact">contact page</Link> or <code>/.well-known/security.txt</code>. We
          ask that you give us reasonable time to fix issues before public disclosure.
        </p>
      </article>
    </>
  );
}
