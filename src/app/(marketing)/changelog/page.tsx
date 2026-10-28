import { PageHeader } from "@/components/site/marketing";
import { Badge } from "@/components/ui/primitives";

export const metadata = { title: "Changelog", description: "What's new in VaultDrop." };

const ENTRIES = [
  {
    version: "0.1.0",
    date: "2026-10-28",
    tag: "Initial release candidate",
    items: [
      "Browser-side AES-256-GCM encryption with HKDF-SHA256 key separation and 256-byte padding.",
      "Passphrase protection with Argon2id and server-verifiable proofs — wrong passphrases never consume a secret.",
      "Transactional, concurrency-safe one-time redemption; multi-view links on paid plans.",
      "Private receipt links to check status or destroy a secret before it is read.",
      "Optional accounts: email verification, password reset, passkeys, TOTP two-factor, session management.",
      "Dashboard with metadata-only history, search, filters and notifications.",
      "REST API v1 with OpenAPI spec, hashed API keys with scopes, idempotency keys and live/test environments.",
      "HMAC-signed webhooks with retries; CLI for creating and opening secrets from the terminal.",
      "Organizations with invitations and roles; Stripe billing integration (when configured).",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <>
      <PageHeader eyebrow="Changelog" title="Product updates" />
      <div className="container-page max-w-3xl py-14">
        {ENTRIES.map((e) => (
          <section key={e.version} className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <div>
              <time dateTime={e.date} className="text-muted-foreground text-sm">
                {new Date(e.date).toLocaleDateString("en", { dateStyle: "long" })}
              </time>
              <div className="mt-1 font-mono text-sm">v{e.version}</div>
            </div>
            <div>
              <Badge>{e.tag}</Badge>
              <ul className="text-muted-foreground mt-4 list-disc space-y-2 pl-5 text-sm">
                {e.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
