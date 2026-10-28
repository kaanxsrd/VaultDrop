import Link from "next/link";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { LinkAnatomy } from "@/components/site/link-anatomy";
import { PageHeader } from "@/components/site/marketing";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "How it works",
  description: "How VaultDrop encrypts, shares and destroys secrets — step by step.",
};

const STEPS = [
  {
    title: "You write the secret",
    body: "Type or paste it into the composer. Nothing has left your device yet. Choose how long the link should live, whether a passphrase is required, and (on paid plans) how many times it may be opened.",
  },
  {
    title: "Your browser encrypts it",
    body: "A fresh 256-bit random key is generated for this secret alone. Your browser derives an encryption key and a separate “proof” from it with HKDF-SHA256, pads the text to hide its exact length, and encrypts it with AES-256-GCM. If you set a passphrase, it is stretched with Argon2id and mixed into the key, so the link alone is not enough.",
  },
  {
    title: "VaultDrop stores ciphertext only",
    body: "We receive the ciphertext, a random IV, the Argon2id salt (if any) and a SHA-256 hash of the proof. We never receive the key, the passphrase, or the text. We return a random 128-bit identifier.",
  },
  {
    title: "You share one link",
    body: "The link looks like /s/<id>#<key>. The part after “#” is a URL fragment: browsers keep it on the device and do not send it in HTTP requests, so it never appears in our server logs. Send the passphrase, if any, through a different channel.",
  },
  {
    title: "The recipient opens it once",
    body: "Their browser reads the key from the fragment, derives the proof (asking for the passphrase if needed) and sends only the proof. If it matches, VaultDrop marks the secret consumed and deletes the ciphertext in the same database transaction, then returns it. A wrong passphrase leaves the secret untouched — until too many failures destroy it.",
  },
  {
    title: "Nothing is left to open",
    body: "The recipient's browser decrypts and displays the secret. Any later visit to the link shows that it was already opened. Unopened secrets are destroyed at their expiry time; you can also destroy one early from your private receipt link or dashboard.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="From your clipboard to their screen — and then nowhere"
        description="A walkthrough of exactly what happens to a secret, and who can see what at each step."
      />
      <div className="container-page grid gap-12 py-16 lg:grid-cols-[1fr_26rem]">
        <div className="relative min-w-0">
          {/* Timeline rail: a sibling of the list, since <ol> may only contain <li>. */}
          <span
            aria-hidden
            className="via-border absolute top-2 bottom-2 left-[15px] w-px bg-linear-to-b from-(--logo-1) to-transparent"
          />
          <Stagger as="ol" className="relative flex flex-col gap-8">
            {STEPS.map((s, i) => (
              <StaggerItem
                as="li"
                key={s.title}
                className="relative grid grid-cols-[2rem_1fr] gap-4"
              >
                <span className="shadow-soft relative z-10 grid size-8 place-items-center rounded-full bg-linear-135 from-(--logo-1) to-(--logo-3) font-mono text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <div>
                  <h2 className="text-lg font-semibold">{s.title}</h2>
                  <p className="text-muted-foreground mt-2">{s.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <Reveal>
            <LinkAnatomy />
          </Reveal>
          <div className="border-border bg-card rounded-xl border p-5 text-sm">
            <h3 className="font-semibold">What VaultDrop cannot protect against</h3>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1.5 pl-5">
              <li>Malware or a malicious browser extension on either device.</li>
              <li>The recipient taking a screenshot or copying the secret.</li>
              <li>Someone who intercepts both the link and the passphrase.</li>
              <li>
                A link opened by the wrong person first — the receipt will show it was opened.
              </li>
            </ul>
          </div>
          <Button asChild>
            <Link href="/security">Read the security architecture</Link>
          </Button>
        </aside>
      </div>
    </>
  );
}
