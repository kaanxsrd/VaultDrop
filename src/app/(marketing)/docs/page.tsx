import Link from "next/link";
import { CodeBlock } from "@/components/code/code-block";
import { CodeTabs } from "@/components/code/code-tabs";
import { PageHeader } from "@/components/site/marketing";
import { DocsToc } from "./docs-toc";
import {
  CLI,
  CURL_FLOW,
  GITHUB_ACTIONS,
  GO,
  PYTHON,
  TYPESCRIPT,
  WEBHOOK_PAYLOAD,
  WEBHOOK_VERIFY,
} from "./snippets";

export const metadata = {
  title: "Developer documentation",
  description: "Use VaultDrop from code: REST API, CLI, SDK examples, webhooks and CI/CD.",
};

const TOC = [
  ["quickstart", "Quickstart"],
  ["auth", "Authentication"],
  ["envelope", "Envelope format"],
  ["cli", "CLI"],
  ["sdks", "SDK examples"],
  ["errors", "Errors & limits"],
  ["idempotency", "Idempotency"],
  ["webhooks", "Webhooks"],
  ["cicd", "CI/CD"],
] as const;

export default function DocsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Developers"
        title="Build with VaultDrop"
        description="A versioned REST API where encryption stays on your side. Create one-time links from scripts, pipelines and apps."
      />
      <div className="container-page grid gap-10 py-12 lg:grid-cols-[13rem_1fr]">
        <DocsToc items={TOC} />
        <article className="prose-vd max-w-3xl min-w-0">
          <h2 id="quickstart">Quickstart</h2>
          <p>
            VaultDrop never accepts plaintext. Your client encrypts the secret, sends the
            ciphertext, and builds the share link by appending the key as a URL fragment. The
            quickest route is the CLI; the API is fully documented in the{" "}
            <Link href="/docs/api">API reference</Link> and as an{" "}
            <a href="/api/v1/openapi.json">OpenAPI 3.1 spec</a>.
          </p>
          <CodeBlock code={CURL_FLOW} lang="bash" title="quickstart.sh" />

          <h2 id="auth">Authentication</h2>
          <p>
            Anonymous requests can create secrets with anonymous limits. For higher limits, labels,
            listing and webhooks, create an API key in{" "}
            <Link href="/dashboard/api-keys">Dashboard → API keys</Link> (Pro plan and above) and
            send <code>Authorization: Bearer vd_live_…</code>. Keys are shown once and stored only
            as SHA-256 hashes. Scopes: <code>secrets:create</code>, <code>secrets:read</code>,{" "}
            <code>secrets:burn</code>, <code>webhooks:manage</code>. Test keys (
            <code>vd_test_…</code>) create secrets tagged <code>environment: test</code> and only
            list test secrets.
          </p>

          <h2 id="envelope">Envelope format (v1)</h2>
          <table>
            <tbody>
              <tr>
                <td>linkKey</td>
                <td>
                  32 random bytes, base64url — goes after <code>#</code> in the link
                </td>
              </tr>
              <tr>
                <td>pwKey</td>
                <td>
                  Argon2id(NFKC(passphrase), salt16, t=2, m=19456 KiB, p=1, 32 bytes) — only with a
                  passphrase
                </td>
              </tr>
              <tr>
                <td>ikm</td>
                <td>linkKey ‖ pwKey (or linkKey alone)</td>
              </tr>
              <tr>
                <td>encKey / proof</td>
                <td>
                  HKDF-SHA256(ikm, salt=&quot;vaultdrop/v1/hkdf-salt&quot;,
                  info=&quot;vaultdrop/v1/enc&quot; | &quot;vaultdrop/v1/auth&quot;, 32 bytes)
                </td>
              </tr>
              <tr>
                <td>plaintext</td>
                <td>
                  uint32 big-endian length ‖ UTF-8 bytes ‖ zero padding to a multiple of 256 bytes
                </td>
              </tr>
              <tr>
                <td>ct</td>
                <td>
                  AES-256-GCM(encKey, iv=12 random bytes, aad=&quot;vaultdrop/v1&quot;), tag
                  appended
                </td>
              </tr>
              <tr>
                <td>verifier</td>
                <td>base64url(SHA-256(proof)) — sent at creation</td>
              </tr>
            </tbody>
          </table>
          <p>
            To open a secret: <code>GET /secrets/:id/status</code> (returns KDF params), derive
            keys, <code>POST /secrets/:id/redeem</code> with <code>{"{ proof }"}</code>, then
            decrypt the returned envelope. Redemption consumes a view only if the proof is correct.
          </p>

          <h2 id="cli">CLI</h2>
          <CodeBlock code={CLI} lang="bash" title="terminal" />

          <h2 id="sdks">SDK examples</h2>
          <p>
            Each example encrypts locally and creates a secret over the REST API. TypeScript mirrors
            the CLI and is covered by interoperability tests; Python and Go are reference examples.
          </p>
          <CodeTabs
            label="SDK language"
            tabs={[
              {
                id: "typescript",
                label: "TypeScript",
                content: <CodeBlock code={TYPESCRIPT} lang="typescript" title="vaultdrop.ts" />,
              },
              {
                id: "python",
                label: "Python",
                content: <CodeBlock code={PYTHON} lang="python" title="vaultdrop.py" />,
              },
              {
                id: "go",
                label: "Go",
                content: <CodeBlock code={GO} lang="go" title="vaultdrop.go" />,
              },
            ]}
          />

          <h2 id="errors">Errors & limits</h2>
          <p>
            Errors share one shape:{" "}
            <code>{'{ "error": { "code", "message", "details" }, "requestId" }'}</code>. Include the{" "}
            <code>requestId</code> (also in the <code>X-Request-Id</code> header) when contacting
            support.
          </p>
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Code</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>401</td>
                <td>unauthorized</td>
                <td>Missing or invalid API key / session</td>
              </tr>
              <tr>
                <td>403</td>
                <td>forbidden, plan_restricted, invalid_proof</td>
                <td>Scope missing, plan limit, or wrong passphrase/link (secret not consumed)</td>
              </tr>
              <tr>
                <td>404</td>
                <td>not_found</td>
                <td>Unknown secret, or not yours</td>
              </tr>
              <tr>
                <td>410</td>
                <td>secret_unavailable</td>
                <td>
                  Consumed, expired or revoked — see <code>details.state</code>
                </td>
              </tr>
              <tr>
                <td>413</td>
                <td>payload_too_large</td>
                <td>Ciphertext over your plan&apos;s size limit</td>
              </tr>
              <tr>
                <td>422</td>
                <td>validation_failed, idempotency_mismatch</td>
                <td>Invalid body, or reused idempotency key</td>
              </tr>
              <tr>
                <td>429</td>
                <td>rate_limited, quota_exceeded</td>
                <td>
                  Slow down; honour <code>Retry-After</code>
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            Default limits: anonymous creation 20 per 10 minutes per client; redemption 30 per
            minute per client and 10 per minute per secret; API keys per plan (e.g. Pro 120/min).
          </p>

          <h2 id="idempotency">Idempotency</h2>
          <p>
            Send <code>Idempotency-Key: &lt;8–128 chars&gt;</code> with authenticated{" "}
            <code>POST /secrets</code>. Retrying with the same key and body within 24 hours returns
            the original response (header <code>Idempotent-Replayed: true</code>) instead of
            creating a duplicate. Reusing a key with a different body returns 422.
          </p>

          <h2 id="webhooks">Webhooks</h2>
          <p>
            Events: <code>secret.created</code>, <code>secret.viewed</code>,{" "}
            <code>secret.consumed</code>, <code>secret.revoked</code>, <code>secret.expired</code>.
            Payloads contain metadata only. Each delivery is signed with your endpoint&apos;s
            secret; failed deliveries (non-2xx or timeout after 10s) are retried after 1m, 5m, 30m,
            2h, 6h, 12h and 24h. Endpoints must be public HTTPS URLs.
          </p>
          <CodeBlock code={WEBHOOK_PAYLOAD} lang="json" title="secret.consumed.json" />
          <CodeBlock code={WEBHOOK_VERIFY} lang="typescript" title="verify.ts" />

          <h2 id="cicd">CI/CD</h2>
          <p>
            Use a test key in staging pipelines and a live key in production. Never print the link
            to public logs.
          </p>
          <CodeBlock
            code={GITHUB_ACTIONS}
            lang="yaml"
            title=".github/workflows/share-credentials.yml"
          />
        </article>
      </div>
    </>
  );
}
