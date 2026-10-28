import { PageHeader } from "@/components/site/marketing";
import { env } from "@/server/env";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Privacy policy"
        description="Last updated 28 October 2026."
      />
      <article className="container-page prose-vd max-w-3xl py-14">
        <p>
          <strong>Operator note:</strong> this policy describes how the VaultDrop software handles
          data. Whoever operates a VaultDrop deployment is the data controller and should have it
          reviewed by counsel and completed with their legal entity, address and jurisdiction before
          publishing.
        </p>
        <h2>The short version</h2>
        <ul>
          <li>
            We cannot read your secrets. They are encrypted in your browser; we store only
            ciphertext.
          </li>
          <li>
            We collect the minimum metadata needed to run the service and keep it for limited
            periods.
          </li>
          <li>We do not use advertising, third-party analytics or tracking pixels.</li>
          <li>We do not sell personal data.</li>
        </ul>
        <h2>What we process</h2>
        <h3>Secrets</h3>
        <p>
          Encrypted payloads, a random identifier, timestamps, view counts, a size bucket, a one-way
          verifier and KDF parameters. The encrypted payload is deleted as soon as the secret is
          opened (final view), expires or is destroyed. Metadata of anonymous secrets is deleted 24
          hours after that; metadata of account holders&apos; secrets after 30 days.
        </p>
        <h3>Accounts (optional)</h3>
        <p>
          Name, email address, a password hash (Argon2id), passkey public keys, two-factor
          configuration, session records (including IP address and browser user-agent, shown to you
          on your Security page), API key hashes, webhook configuration, notifications, subscription
          status and metadata-only audit events.
        </p>
        <h3>Requests</h3>
        <p>
          IP addresses are used transiently for rate limiting and abuse prevention; VaultDrop stores
          them only as keyed pseudonyms that expire with the rate-limit window. Server logs record
          request paths with secret identifiers removed, status codes and timing; they never include
          secret content, keys or tokens.
        </p>
        <h3>Payments</h3>
        <p>
          Payments are processed by Stripe. We receive subscription status and a customer
          identifier, never full card details.
        </p>
        <h2>Your rights</h2>
        <p>
          You can view and update your profile, revoke sessions and API keys, and delete your
          account at any time from the dashboard. Account deletion removes your account, active
          secrets and related records; residual copies in encrypted backups expire according to the
          backup retention schedule.
        </p>
        <h2>Contact</h2>
        <p>
          Questions about privacy:{" "}
          <a href={`mailto:${env().SUPPORT_EMAIL}`}>{env().SUPPORT_EMAIL}</a>.
        </p>
      </article>
    </>
  );
}
