"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Switch,
} from "@/components/ui/overlays";
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function SettingsForms({
  name: initialName,
  email,
  notifyOnRead: initialNotify,
}: {
  name: string;
  email: string;
  notifyOnRead: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [notify, setNotify] = useState(initialNotify);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setSaving(false);
    if (error) toast(authErrorMessage(error), "error");
    else {
      toast("Profile saved.", "success");
      router.refresh();
    }
  }

  async function toggleNotify(v: boolean) {
    setNotify(v);
    const res = await apiFetch("/api/v1/account/settings", {
      method: "PATCH",
      json: { notifyOnRead: v },
    });
    if (!res.ok) {
      setNotify(!v);
      toast(res.error.message, "error");
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    const { error } = await authClient.deleteUser({ password });
    setDeleting(false);
    if (error) return setDeleteError(authErrorMessage(error));
    router.push("/?account=deleted");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>{email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" loading={saving} disabled={!name.trim() || name === initialName}>
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
          <CardDescription>
            VaultDrop keeps only the metadata needed to show you a secret&apos;s status.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="notify">Read notifications</Label>
              <p className="text-muted-foreground mt-1 text-sm">
                Notify me in the dashboard when a secret I shared is opened.
              </p>
            </div>
            <Switch id="notify" checked={notify} onCheckedChange={(v) => void toggleNotify(v)} />
          </div>
          <p className="text-muted-foreground text-sm">
            Metadata for opened, expired or destroyed secrets is purged automatically after 30 days.
            Encrypted content is deleted the moment a secret leaves the active state.
          </p>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Permanently deletes your account, all active secrets (their links stop working), API
            keys, webhooks and sessions. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">Delete account…</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>Enter your password and type DELETE to confirm.</DialogDescription>
              <div className="flex flex-col gap-2">
                <Label htmlFor="del-pass">Password</Label>
                <Input
                  id="del-pass"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="del-confirm">Type DELETE</Label>
                <Input
                  id="del-confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                />
              </div>
              {deleteError && (
                <Alert variant="destructive">
                  <span>{deleteError}</span>
                </Alert>
              )}
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={confirmText !== "DELETE" || !password}
                  loading={deleting}
                  onClick={() => void deleteAccount()}
                >
                  Delete permanently
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
