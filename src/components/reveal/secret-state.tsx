import { Ban, Clock3, Flame, Link2Off, ShieldX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export type UnavailableReason =
  | "consumed"
  | "expired"
  | "revoked"
  | "not_found"
  | "locked"
  | "incomplete";

const COPY: Record<UnavailableReason, { icon: typeof Flame; title: string; body: string }> = {
  consumed: {
    icon: Flame,
    title: "This secret has already been opened",
    body: "Secrets can only be viewed once and are destroyed immediately after. If you didn't open it yourself, someone else may have — let the sender know so they can rotate the credential.",
  },
  expired: {
    icon: Clock3,
    title: "This secret has expired",
    body: "It wasn't opened before its expiry time and has been deleted. Ask the sender to share a new link.",
  },
  revoked: {
    icon: Ban,
    title: "This secret was destroyed",
    body: "The sender destroyed it before it was viewed, or too many incorrect passphrases were entered. Ask the sender for a new link.",
  },
  locked: {
    icon: ShieldX,
    title: "Too many incorrect attempts",
    body: "To protect against guessing, the secret has been permanently destroyed. Ask the sender to share it again.",
  },
  not_found: {
    icon: Link2Off,
    title: "This secret doesn't exist",
    body: "The link may be mistyped, or the secret was opened or expired long enough ago that even its record is gone.",
  },
  incomplete: {
    icon: Link2Off,
    title: "This link is incomplete",
    body: "The decryption key — the part after “#” — is missing or damaged. Copy the full link again, exactly as you received it.",
  },
};

export function SecretUnavailable({ reason }: { reason: UnavailableReason }) {
  const { icon: Icon, title, body } = COPY[reason];
  return (
    <div
      className="animate-rise flex flex-col items-center gap-4 py-6 text-center"
      data-testid={`state-${reason}`}
    >
      <span className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-full">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">{body}</p>
      </div>
      <Button asChild variant="outline">
        <Link href="/">Share a secret of your own</Link>
      </Button>
    </div>
  );
}
