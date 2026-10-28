import { handleStripeWebhook } from "@/server/billing";
import { json, route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/** Stripe → VaultDrop. The raw body is required for signature verification. */
export const POST = route(async ({ req }) => {
  const raw = await req.text();
  if (raw.length > 512 * 1024)
    return json({ error: { code: "payload_too_large", message: "Too large" } }, { status: 413 });
  return json(await handleStripeWebhook(raw, req.headers.get("stripe-signature")));
});
