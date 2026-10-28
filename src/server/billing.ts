import "server-only";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import type { PlanId } from "@/config/plans";
import { newId } from "@/server/crypto";
import { getDb } from "@/server/db/client";
import { subscriptions } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { audit } from "@/server/events";
import { logger } from "@/server/log";

/**
 * Stripe billing. Subscription state in our database is changed only by verified Stripe webhooks —
 * never by the browser returning from checkout — so payment success cannot be spoofed.
 */

const PURCHASABLE = ["personal", "pro", "team"] as const;
export type PurchasablePlan = (typeof PURCHASABLE)[number];

export function billingEnabled(): boolean {
  return Boolean(env().STRIPE_SECRET_KEY && env().STRIPE_WEBHOOK_SECRET);
}

let client: Stripe | null = null;
function stripe(): Stripe {
  const key = env().STRIPE_SECRET_KEY;
  if (!key)
    throw new AppError("service_unavailable", "Billing is not configured on this deployment.");
  client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 });
  return client;
}

function priceIds(): Record<PurchasablePlan, string | undefined> {
  return {
    personal: env().STRIPE_PRICE_PERSONAL,
    pro: env().STRIPE_PRICE_PRO,
    team: env().STRIPE_PRICE_TEAM,
  };
}

export function planForPrice(priceId: string | undefined | null): PlanId | null {
  if (!priceId) return null;
  const entry = Object.entries(priceIds()).find(([, id]) => id === priceId);
  return (entry?.[0] as PlanId | undefined) ?? null;
}

export async function createCheckoutSession(
  subject: { userId: string; email: string; organizationId: string | null },
  plan: string,
): Promise<string> {
  if (!(PURCHASABLE as readonly string[]).includes(plan))
    throw new AppError("validation_failed", "This plan cannot be purchased online.");
  const price = priceIds()[plan as PurchasablePlan];
  if (!price)
    throw new AppError(
      "service_unavailable",
      `No Stripe price is configured for the ${plan} plan.`,
    );
  const key = subject.organizationId ? `org:${subject.organizationId}` : `user:${subject.userId}`;
  const db = await getDb();
  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.subject, key));
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    ...(existing?.stripeCustomerId
      ? { customer: existing.stripeCustomerId }
      : { customer_email: subject.email }),
    client_reference_id: key,
    metadata: { subject: key, plan },
    subscription_data: { metadata: { subject: key, plan } },
    success_url: `${env().APP_URL}/dashboard/billing?checkout=success`,
    cancel_url: `${env().APP_URL}/dashboard/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  });
  if (!session.url)
    throw new AppError("service_unavailable", "Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(subjectKey: string): Promise<string> {
  const db = await getDb();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.subject, subjectKey));
  if (!row?.stripeCustomerId) throw new AppError("not_found", "No billing account exists yet.");
  const session = await stripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${env().APP_URL}/dashboard/billing`,
  });
  return session.url;
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  const fromItem = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const ts =
    fromItem?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  return ts ? new Date(ts * 1000) : null;
}

async function upsertFromSubscription(sub: Stripe.Subscription): Promise<void> {
  const subject = sub.metadata?.subject;
  if (!subject || !/^(user|org):/.test(subject)) {
    logger.warn({ subscription: sub.id }, "stripe subscription without subject metadata ignored");
    return;
  }
  const plan =
    planForPrice(sub.items?.data?.[0]?.price?.id) ??
    (sub.metadata?.plan as PlanId | undefined) ??
    "free";
  const values = {
    subject,
    plan,
    status: sub.status,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: periodEnd(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };
  const db = await getDb();
  await db
    .insert(subscriptions)
    .values({ id: newId("sub"), ...values })
    .onConflictDoUpdate({ target: subscriptions.subject, set: values });
  const [kind, id] = subject.split(":") as ["user" | "org", string];
  await audit(db, {
    userId: kind === "user" ? id : null,
    organizationId: kind === "org" ? id : null,
    action: "subscription.updated",
    metadata: { plan, status: sub.status },
  });
}

/** Verifies the Stripe signature over the raw body, then applies the event. */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<{ handled: boolean; type: string }> {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new AppError("service_unavailable", "Billing webhooks are not configured.");
  if (!signature) throw new AppError("bad_request", "Missing Stripe-Signature header.");
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new AppError("bad_request", "Invalid Stripe signature.");
  }
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await upsertFromSubscription(event.data.object);
      return { handled: true, type: event.type };
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.subscription) {
        const sub = await stripe().subscriptions.retrieve(
          typeof s.subscription === "string" ? s.subscription : s.subscription.id,
        );
        await upsertFromSubscription(sub);
      }
      return { handled: true, type: event.type };
    }
    default:
      return { handled: false, type: event.type };
  }
}

export async function subscriptionFor(subjectKey: string) {
  const db = await getDb();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.subject, subjectKey));
  return row ?? null;
}
