import { PageHeader } from "@/components/site/marketing";

export const metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Terms of service"
        description="Last updated 28 October 2026."
      />
      <article className="container-page prose-vd max-w-3xl py-14">
        <p>
          <strong>Operator note:</strong> these terms are a starting point provided with the
          VaultDrop software. Operators must adapt them to their entity, governing law and offering,
          and have them reviewed by counsel.
        </p>
        <h2>1. The service</h2>
        <p>
          VaultDrop lets you share information through encrypted links that expire or self-destruct.
          Because encryption keys never reach us, we cannot recover a secret whose link is lost, and
          we cannot read secrets to assist with disputes.
        </p>
        <h2>2. Acceptable use</h2>
        <ul>
          <li>
            Do not use VaultDrop to distribute malware, phishing content, or material that is
            illegal to possess or share.
          </li>
          <li>
            Do not attempt to circumvent rate limits, quotas or security controls, or to access
            secrets that were not shared with you.
          </li>
          <li>Automated use must go through the documented API and respect its limits.</li>
        </ul>
        <h2>3. Accounts</h2>
        <p>
          You are responsible for keeping your credentials, API keys and receipt links confidential.
          You may delete your account at any time.
        </p>
        <h2>4. Paid plans</h2>
        <p>
          Subscriptions renew automatically until cancelled in the billing portal. Plan limits are
          described on the pricing page and may change with notice for future billing periods.
        </p>
        <h2>5. No guarantee of delivery</h2>
        <p>
          A one-time secret is destroyed when it is first opened, even if the person who opened it
          is not the intended recipient, and even if the connection drops after our server released
          it. Use passphrases for sensitive material and confirm receipt through another channel.
        </p>
        <h2>6. Disclaimer and liability</h2>
        <p>
          The service is provided &quot;as is&quot;. To the extent permitted by law, the operator is
          not liable for indirect or consequential damages, or for loss resulting from compromised
          devices, intercepted links or passphrases, or misuse by recipients.
        </p>
        <h2>7. Changes</h2>
        <p>We will post changes here and, for material changes, notify account holders by email.</p>
      </article>
    </>
  );
}
