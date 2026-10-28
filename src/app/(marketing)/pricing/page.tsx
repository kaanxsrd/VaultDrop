import { Check, Minus } from "lucide-react";
import { PageHeader, PricingCards } from "@/components/site/marketing";
import { PLANS, type PlanLimits, PUBLIC_PLANS } from "@/config/plans";
import { formatBytes, formatDuration } from "@/lib/utils";

export const metadata = {
  title: "Pricing",
  description:
    "VaultDrop plans: free anonymous sharing, plus plans for individuals, developers and teams.",
};

const ROWS: { label: string; get: (l: PlanLimits) => string | boolean }[] = [
  { label: "One-time encrypted secrets", get: () => true },
  { label: "Passphrase protection", get: () => true },
  { label: "Maximum secret size", get: (l) => formatBytes(l.maxCiphertextBytes - 16) },
  { label: "Longest expiry", get: (l) => formatDuration(l.maxExpirySeconds) },
  { label: "Views per secret", get: (l) => String(l.maxViews) },
  {
    label: "Secrets per month",
    get: (l) => (l.secretsPerMonth === null ? "Custom" : l.secretsPerMonth.toLocaleString()),
  },
  { label: "Dashboard & private labels", get: (l) => l.labels },
  { label: "REST API, CLI & SDK", get: (l) => l.apiAccess },
  { label: "API rate limit", get: (l) => (l.apiAccess ? `${l.apiRequestsPerMinute}/min` : false) },
  { label: "Signed webhooks", get: (l) => l.webhooks },
  { label: "Organizations & roles", get: (l) => l.teams },
  { label: "Share-page branding", get: (l) => l.branding },
  { label: "SSO (OIDC/SAML)", get: (l) => (l.sso ? "Roadmap" : false) },
];

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Simple plans. Anonymous sharing is always free."
        description="Prices are in USD and exclude taxes. Limits apply per account or organization."
      />
      <div className="container-page py-14">
        <PricingCards />
        <section
          // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be keyboard-focusable (WCAG 2.1.1)
          tabIndex={0}
          aria-label="Plan comparison table"
          className="border-border bg-card mt-16 overflow-x-auto rounded-xl border"
        >
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">Plan comparison</caption>
            <thead>
              <tr className="border-border bg-subtle border-b text-left">
                <th scope="col" className="px-4 py-3 font-medium">
                  Feature
                </th>
                {PUBLIC_PLANS.map((id) => (
                  <th key={id} scope="col" className="px-4 py-3 font-medium">
                    {PLANS[id].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="text-muted-foreground px-4 py-3 text-left font-normal">
                    {row.label}
                  </th>
                  {PUBLIC_PLANS.map((id) => {
                    const v = row.get(PLANS[id].limits);
                    return (
                      <td key={id} className="px-4 py-3">
                        {v === true ? (
                          <Check className="text-primary size-4" aria-label="Included" />
                        ) : v === false ? (
                          <Minus
                            className="text-muted-foreground/60 size-4"
                            aria-label="Not included"
                          />
                        ) : (
                          v
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <p className="text-muted-foreground mt-6 text-sm">
          Anonymous use (no account) has the Free plan&apos;s size and expiry limits, one view per
          secret, and stricter rate limits. Every plan uses the same end-to-end encryption.
        </p>
      </div>
    </>
  );
}
