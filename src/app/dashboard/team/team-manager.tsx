"use client";

import { Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/dashboard/page-title";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/overlays";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function TeamManager({
  currentUserId,
  canCreate,
}: {
  currentUserId: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { data: orgs, isPending, refetch } = authClient.useListOrganizations();
  const { data: active, refetch: refetchActive } = authClient.useActiveOrganization();
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const slug = `${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await authClient.organization.create({ name: name.trim(), slug });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    setName("");
    refetch();
  }

  async function switchTo(organizationId: string | null) {
    await authClient.organization.setActive({ organizationId });
    refetchActive();
    router.refresh();
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.organization.inviteMember({
      email: inviteEmail,
      role: inviteRole as "member" | "admin",
    });
    setBusy(false);
    if (error) return toast(authErrorMessage(error), "error");
    setInviteEmail("");
    toast("Invitation sent.", "success");
    refetchActive();
  }

  async function removeMember(memberId: string) {
    const { error } = await authClient.organization.removeMember({ memberIdOrEmail: memberId });
    if (error) toast(authErrorMessage(error), "error");
    else refetchActive();
  }

  const myRole = active?.members.find((m) => m.userId === currentUserId)?.role;
  const canManage = myRole === "owner" || myRole === "admin";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : !orgs || orgs.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No organizations yet"
              description="Create one to share secrets as a team, with central limits and an audit trail."
            />
          ) : (
            <ul className="divide-border border-border divide-y rounded-lg border">
              <li className="flex items-center justify-between px-3 py-2.5 text-sm">
                <span>Personal</span>
                {!active ? (
                  <Badge>Active</Badge>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => void switchTo(null)}>
                    Switch
                  </Button>
                )}
              </li>
              {orgs.map((o) => (
                <li key={o.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <span className="font-medium">{o.name}</span>
                  {active?.id === o.id ? (
                    <Badge>Active</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => void switchTo(o.id)}>
                      Switch
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canCreate && (
            <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="org-name">New organization</Label>
                <Input
                  id="org-name"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Platform Team"
                />
              </div>
              <Button type="submit" loading={busy} disabled={!name.trim()}>
                <Plus /> Create
              </Button>
            </form>
          )}
          {error && (
            <Alert variant="destructive">
              <span>{error}</span>
            </Alert>
          )}
        </CardContent>
      </Card>

      {active && (
        <Card>
          <CardHeader>
            <CardTitle>{active.name} · members</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="divide-border border-border divide-y rounded-lg border">
              {active.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <span>
                    {m.user.name} <span className="text-muted-foreground">· {m.user.email}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant="neutral">{m.role}</Badge>
                    {canManage && m.userId !== currentUserId && m.role !== "owner" && (
                      <Button size="sm" variant="ghost" onClick={() => void removeMember(m.id)}>
                        Remove
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {active.invitations.filter((i) => i.status === "pending").length > 0 && (
              <div className="text-muted-foreground text-sm">
                Pending:{" "}
                {active.invitations
                  .filter((i) => i.status === "pending")
                  .map((i) => i.email)
                  .join(", ")}
              </div>
            )}
            {canManage && (
              <form
                onSubmit={invite}
                className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="invite-email">Invite by email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <Select
                  aria-label="Role"
                  value={inviteRole}
                  onValueChange={setInviteRole}
                  options={[
                    { value: "member", label: "Member" },
                    { value: "admin", label: "Admin" },
                  ]}
                />
                <Button type="submit" loading={busy}>
                  Invite
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
