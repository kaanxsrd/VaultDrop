"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/primitives";
import { apiFetch } from "@/lib/api-client";

export function BillingActions({
  enabled,
  currentPlan,
  hasCustomer,
  plans,
}: {
  enabled: boolean;
  currentPlan: string;
  hasCustomer: boolean;
  plans: { id: string; name: string; price: number; perSeat: boolean }[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(action: "checkout" | "portal", plan?: string) {
    setBusy(plan ?? action);
    setError(null);
    const res = await apiFetch<{ url: string }>("/api/billing/checkout", {
      method: "POST",
      json: { action, plan },
    });
    if (res.ok && res.data.url.startsWith("https://")) {
      window.location.assign(res.data.url);
      return;
    }
    setBusy(null);
    setError(res.ok ? "Unexpected billing response." : res.error.message);
  }

  if (!enabled) {
    return (
      <Card className="p-5 text-sm">
        <h2 className="font-semibold">Billing not configured</h2>
        <p className="text-muted-foreground mt-2">
          This deployment has no Stripe credentials, so plans can&apos;t be purchased here.
          Self-hosters can assign plans from the admin area.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="font-semibold">Change plan</h2>
      {plans.map((p) => (
        <Button
          key={p.id}
          variant={p.id === currentPlan ? "secondary" : "outline"}
          disabled={p.id === currentPlan || hasCustomer}
          loading={busy === p.id}
          onClick={() => void go("checkout", p.id)}
          className="justify-between"
        >
          <span>{p.name}</span>
          <span className="text-muted-foreground">
            ${p.price}
            {p.perSeat ? "/seat" : ""}/mo
          </span>
        </Button>
      ))}
      {hasCustomer && (
        <Button onClick={() => void go("portal")} loading={busy === "portal"}>
          Manage subscription
        </Button>
      )}
      <p className="text-muted-foreground text-xs">
        Payments are handled by Stripe. Upgrades, downgrades and cancellation happen in the Stripe
        customer portal.
      </p>
      {error && (
        <Alert variant="destructive">
          <span>{error}</span>
        </Alert>
      )}
    </Card>
  );
}
