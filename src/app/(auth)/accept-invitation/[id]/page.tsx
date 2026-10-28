"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export default function AcceptInvitationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function respond(accept: boolean) {
    setBusy(true);
    const res = accept
      ? await authClient.organization.acceptInvitation({ invitationId: id })
      : await authClient.organization.rejectInvitation({ invitationId: id });
    setBusy(false);
    if (res.error) return setError(authErrorMessage(res.error));
    router.push(accept ? "/dashboard/team" : "/dashboard");
  }

  return (
    <AuthCard title="Team invitation" description="Join a VaultDrop organization.">
      {isPending ? null : !session ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            Sign in with the email address the invitation was sent to.
          </p>
          <Button asChild>
            <Link href={`/sign-in?next=/accept-invitation/${id}`}>Sign in to continue</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void respond(true)} loading={busy}>
              Accept
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              onClick={() => void respond(false)}
              disabled={busy}
            >
              Decline
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <span>{error}</span>
            </Alert>
          )}
        </div>
      )}
    </AuthCard>
  );
}
