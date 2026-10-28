import type { Metadata } from "next";
import { SecretReveal } from "@/components/reveal/secret-reveal";
import { MinimalShell } from "@/components/site/minimal-shell";
import { secretIdSchema } from "@/lib/validation/secrets";
import { getSecretStatus } from "@/server/secrets/service";

export const dynamic = "force-dynamic";

// Deliberately generic: link previews must reveal nothing about the secret.
export const metadata: Metadata = {
  title: "You've received a secret",
  description: "Open this one-time link to view a secret shared with you through VaultDrop.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "A secret has been shared with you",
    description: "One-time encrypted link · VaultDrop",
  },
};

export default async function SecretPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Status lookups never consume the secret; redemption happens only on explicit user action.
  const status = secretIdSchema.safeParse(id).success ? await getSecretStatus(id) : null;
  return (
    <MinimalShell>
      <SecretReveal id={id} status={status} />
    </MinimalShell>
  );
}
