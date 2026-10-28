import { Building, LifeBuoy, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/site/marketing";
import { Card } from "@/components/ui/primitives";
import { env } from "@/server/env";

export const metadata = {
  title: "Contact",
  description: "Get help with VaultDrop, report a vulnerability, or talk to us about Enterprise.",
};

export default function ContactPage() {
  const { SUPPORT_EMAIL, SECURITY_EMAIL } = env();
  const cards = [
    {
      icon: LifeBuoy,
      title: "Support",
      body: "Questions about your account, billing or the API. Include the requestId from any error response — never include secret links or contents.",
      href: `mailto:${SUPPORT_EMAIL}`,
      cta: SUPPORT_EMAIL,
    },
    {
      icon: ShieldAlert,
      title: "Security",
      body: "Found a vulnerability? Report it privately. Please allow reasonable time for a fix before disclosure. See /.well-known/security.txt.",
      href: `mailto:${SECURITY_EMAIL}`,
      cta: SECURITY_EMAIL,
    },
    {
      icon: Building,
      title: "Enterprise",
      body: "Custom limits, self-hosting support and organization-wide policies.",
      href: `mailto:${SUPPORT_EMAIL}?subject=VaultDrop%20Enterprise`,
      cta: "Talk to us",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="How can we help?"
        description="We read every message. We will never ask you to send a secret or a VaultDrop link by email."
      />
      <div className="container-page grid gap-4 py-14 md:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.title} className="flex flex-col p-6">
            <c.icon className="text-primary size-5" aria-hidden />
            <h2 className="mt-4 font-semibold">{c.title}</h2>
            <p className="text-muted-foreground mt-1.5 flex-1 text-sm">{c.body}</p>
            <a
              href={c.href}
              className="text-primary mt-4 text-sm font-medium underline-offset-4 hover:underline"
            >
              {c.cta}
            </a>
          </Card>
        ))}
      </div>
      <p className="container-page text-muted-foreground text-sm">
        Looking for answers? Try the{" "}
        <Link href="/docs" className="underline underline-offset-2">
          documentation
        </Link>{" "}
        or the{" "}
        <Link href="/security" className="underline underline-offset-2">
          security overview
        </Link>
        .
      </p>
    </>
  );
}
