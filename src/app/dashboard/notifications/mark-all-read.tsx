"use client";

import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

export function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await apiFetch("/api/v1/account/notifications", { method: "POST" });
        setBusy(false);
        router.refresh();
      }}
    >
      <CheckCheck /> Mark all read
    </Button>
  );
}
