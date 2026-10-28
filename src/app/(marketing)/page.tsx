import {
  ArrowRight,
  Building,
  Clock3,
  CodeXml,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ServerCog,
  ShieldCheck,
  Terminal,
  UserRound,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { CodeBlock } from "@/components/code/code-block";
import { SecretComposer } from "@/components/composer/secret-composer";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { CipherMorph } from "@/components/site/cipher-morph";
import { HowItWorksSteps } from "@/components/site/how-it-works-steps";
import { PricingCards, SectionHeading } from "@/components/site/marketing";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { PLANS } from "@/config/plans";
import { getSession } from "@/server/auth/session";
import { planFor } from "@/server/entitlements";

export const dynamic = "force-dynamic";

const USE_CASES = [
  {
    icon: ServerCog,
    title: "Onboarding credentials",
    body: "Hand a new teammate their first password without it living in chat history forever.",
  },
  {
    icon: CodeXml,
    title: "API keys & tokens",
    body: "Send a production key to a contractor that self-destructs the moment it's read.",
  },
  {
    icon: Terminal,
    title: "CI/CD & scripts",
    body: "Pipe a generated credential into vaultdrop from the terminal and post the link to a ticket.",
  },
  {
    icon: UserRound,
    title: "Personal sharing",
    body: "Wi-Fi passwords, door codes, recovery codes — share them with family without a trace.",
  },
  {
    icon: Building,
    title: "Support & IT",
    body: "Reset a password for a customer and deliver it over a channel that forgets.",
  },
  {
    icon: Webhook,
    title: "Automated workflows",
    body: "Get a signed webhook when a secret is opened, so your system can rotate or revoke access.",
  },
];

const SECURITY_POINTS = [
  ["What we store", "Ciphertext, expiry, view count, a size bucket, and a one-way verifier."],
  ["What we never receive", "Your plaintext, the link key, or your passphrase."],
  [
    "One-time, for real",
    "A row lock plus conditional update guarantees one successful redemption, even under concurrent requests.",
  ],
  [
    "No third parties",
    "No analytics, ads or external scripts. A strict Content Security Policy enforces it.",
  ],
] as const;

const FAQ = [
  {
    q: "Can VaultDrop read my secrets?",
    a: "No. Encryption happens in your browser and the key is only in the part of the link after “#”, which browsers don't send to servers. We store ciphertext we cannot decrypt. If our database leaked, the contents would remain unreadable without the links.",
  },
  {
    q: "What happens after the secret is opened?",
    a: "The encrypted payload is deleted from our database in the same transaction that hands it to the recipient. Any later visit shows that the secret was already opened. A small metadata record (no content) remains for a limited time so the sender's receipt can show the status.",
  },
  {
    q: "What if someone types the wrong passphrase?",
    a: "A wrong passphrase never opens or destroys the secret. To stop guessing, the secret is destroyed after 10 failed attempts by default.",
  },
  {
    q: "Can the recipient take a screenshot?",
    a: "Yes. No website can prevent screenshots, photos or copy-and-paste. VaultDrop limits how long and how often a secret exists on the wire and on our servers; what the recipient does with it afterwards is up to them.",
  },
  {
    q: "Do I need an account?",
    a: "No. Anyone can create and open secrets without signing up. Accounts add a dashboard of metadata, longer expiries, labels, API access and team features.",
  },
  {
    q: "Is VaultDrop open about its limits?",
    a: "Yes — read the security page for exactly what we can see (timestamps, sizes rounded to 256 bytes, IP-based rate limiting) and the risks that remain, such as a compromised device or a malicious browser extension.",
  },
];

const REQUEST_BODY = `// Everything the server ever receives
{
  "envelope": {
    "v": 1,
    "iv": "q3Z1x9Rk2jVb0mNs",
    "ct": "8fJk2Lq0vN…Yw"     // AES-256-GCM
  },
  "kdf": {
    "alg": "argon2id", "salt": "Vb0mQ1…",
    "t": 2, "m": 19456, "p": 1
  },
  "verifier": "M0wJr4…",     // can't decrypt
  "expiresIn": 86400
}`;

const TERMINAL = `echo "$DB_PASSWORD" | vaultdrop --expires 1h
# → https://vaultdrop.example/s/b2Zm…#Jx8…

vaultdrop --passphrase --views 3 < recovery-codes.txt
# Passphrase: ••••••••
# → https://vaultdrop.example/s/7Hq1…#mP2…`;

const HERO_POINTS = [
  [LockKeyhole, "AES-256-GCM in your browser"],
  [EyeOff, "We never see the key"],
  [Clock3, "Expires in minutes or days"],
  [KeyRound, "Optional passphrase"],
] as const;

export default async function HomePage() {
  const session = await getSession();
  const plan = session
    ? await planFor({
        userId: session.user.id,
        organizationId: session.session.activeOrganizationId ?? null,
      })
    : PLANS.anonymous;

  return (
    <>
      <section className="border-border relative overflow-hidden border-b">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)] [background-size:48px_48px] opacity-60"
        />
        <div
          aria-hidden
          className="hero-glow pointer-events-none absolute -top-56 left-[2%] size-[44rem]"
        />
        <div
          aria-hidden
          className="hero-glow pointer-events-none absolute top-24 right-[-12%] size-[36rem] [animation-delay:-9s]"
        />
        <div className="container-page relative grid gap-10 pt-12 pb-16 sm:pt-16 lg:grid-cols-[1fr_minmax(0,36rem)] lg:gap-14 lg:pt-20 lg:pb-24">
          <div className="flex flex-col lg:pt-10">
            <Badge
              variant="outline"
              className="animate-hero bg-card/70 mb-5 self-start py-1 backdrop-blur"
            >
              <ShieldCheck className="text-primary" /> End-to-end encrypted · No account needed
            </Badge>
            <h1 className="animate-hero text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance [animation-delay:80ms] sm:text-5xl lg:text-[3.5rem]">
              Share secrets.
              <br />
              <span className="bg-linear-135 from-(--logo-text-1) to-(--logo-text-2) bg-clip-text pb-1 text-transparent forced-colors:bg-none forced-colors:text-[CanvasText]">
                Leave no trace.
              </span>
            </h1>
            <p className="animate-hero text-muted-foreground mt-5 max-w-lg text-base text-pretty [animation-delay:160ms] sm:text-lg">
              Send passwords, API keys and private notes through an encrypted link that opens once
              and then disappears — from the chat, the inbox and our servers.
            </p>
            <ul className="animate-hero mt-7 hidden max-w-lg gap-3 text-sm [animation-delay:240ms] sm:grid sm:grid-cols-2">
              {HERO_POINTS.map(([Icon, text]) => (
                <li key={text} className="text-foreground/90 flex items-center gap-2.5">
                  <span className="bg-primary-soft text-primary-soft-foreground grid size-7 place-items-center rounded-md">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div className="animate-hero relative [animation-delay:200ms]">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--logo-1)_30%,transparent),transparent)] opacity-70 blur-2xl"
            />
            <Card className="shadow-lifted relative p-4 sm:p-6" id="share">
              <SecretComposer
                signedIn={Boolean(session)}
                limits={{
                  maxCiphertextBytes: plan.limits.maxCiphertextBytes,
                  maxExpirySeconds: plan.limits.maxExpirySeconds,
                  maxViews: plan.limits.maxViews,
                  labels: plan.limits.labels,
                }}
              />
            </Card>
          </div>
        </div>
      </section>

      <section className="container-page py-20">
        <Reveal>
          <SectionHeading eyebrow="How it works" title="Three steps. Zero copies left behind." />
        </Reveal>
        <HowItWorksSteps />
        <Reveal delay={0.1}>
          <Button asChild variant="link" className="mt-6">
            <Link href="/how-it-works">
              Read the full walkthrough <ArrowRight />
            </Link>
          </Button>
        </Reveal>
      </section>

      <section className="border-border bg-subtle border-y py-20">
        <div className="container-page">
          <Reveal>
            <SectionHeading
              eyebrow="Use cases"
              title="For developers, teams and everyone in between"
            />
          </Reveal>
          <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((u) => (
              <StaggerItem
                key={u.title}
                className="group hover:bg-card flex gap-4 rounded-xl p-4 transition-colors"
              >
                <span className="bg-primary-soft text-primary-soft-foreground grid size-9 shrink-0 place-items-center rounded-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                  <u.icon className="size-[18px]" aria-hidden />
                </span>
                <div>
                  <h3 className="font-medium">{u.title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">{u.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="container-page grid gap-10 py-20 lg:grid-cols-2 lg:items-center">
        <div>
          <Reveal>
            <SectionHeading
              eyebrow="Security"
              title="Built so that we can't read your secrets"
              description="Zero-knowledge by construction: the server only ever handles ciphertext and a verifier that cannot decrypt anything."
            />
          </Reveal>
          <Stagger as="dl" className="mt-8 grid gap-5 sm:grid-cols-2">
            {SECURITY_POINTS.map(([t, d]) => (
              <StaggerItem key={t} className="border-primary/30 border-l-2 pl-4">
                <dt className="text-sm font-medium">{t}</dt>
                <dd className="text-muted-foreground mt-1 text-sm">{d}</dd>
              </StaggerItem>
            ))}
          </Stagger>
          <Reveal delay={0.15}>
            <Button asChild variant="outline" className="mt-8">
              <Link href="/security">
                Security architecture <ArrowRight />
              </Link>
            </Button>
          </Reveal>
        </div>
        <div className="flex flex-col gap-4">
          <Reveal>
            <CipherMorph />
          </Reveal>
          <Reveal delay={0.12}>
            <CodeBlock code={REQUEST_BODY} lang="jsonc" title="POST /api/v1/secrets" />
          </Reveal>
        </div>
      </section>

      <section className="border-border bg-subtle border-y py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <Reveal>
              <SectionHeading
                eyebrow="Developers"
                title="An API that keeps the zero-knowledge promise"
                description="Encrypt locally with our CLI or SDK examples, create links over a versioned REST API, and receive signed webhooks when secrets are opened."
              />
            </Reveal>
            <Stagger as="ul" className="text-muted-foreground mt-6 grid gap-2 text-sm">
              {[
                "Versioned REST API with OpenAPI 3.1 spec",
                "Hashed-at-rest API keys with scopes and separate live/test environments",
                "Idempotency keys for safe retries",
                "HMAC-signed webhooks with replay protection and retries",
              ].map((line) => (
                <StaggerItem as="li" key={line} className="flex items-center gap-2.5">
                  <span aria-hidden className="bg-primary size-1.5 rounded-full" />
                  {line}
                </StaggerItem>
              ))}
            </Stagger>
            <Reveal delay={0.1} className="mt-8 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/docs">Read the docs</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/docs/api">API reference</Link>
              </Button>
            </Reveal>
          </div>
          <Reveal y={32}>
            <CodeBlock
              code={TERMINAL}
              lang="bash"
              title="~/projects/api — zsh"
              lineNumbers={false}
            />
          </Reveal>
        </div>
      </section>

      <section className="container-page py-20">
        <Reveal>
          <SectionHeading
            eyebrow="Pricing"
            title="Free for everyday sharing. Plans for teams and automation."
          />
        </Reveal>
        <div className="mt-10">
          <PricingCards compact />
        </div>
        <Reveal>
          <Button asChild variant="link" className="mt-6">
            <Link href="/pricing">
              Compare all plans <ArrowRight />
            </Link>
          </Button>
        </Reveal>
      </section>

      <section className="container-page pb-4" id="faq">
        <Reveal>
          <SectionHeading eyebrow="FAQ" title="Questions, answered plainly" />
        </Reveal>
        <Reveal delay={0.08} className="mt-8">
          <Accordion items={FAQ} />
        </Reveal>
      </section>
    </>
  );
}
