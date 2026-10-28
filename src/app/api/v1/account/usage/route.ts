import { currentPeriod, usageFor } from "@/server/entitlements";
import { requireAccount, resolveActor } from "@/server/http/actor";
import { json, route } from "@/server/http/route";
import { secretStats } from "@/server/secrets/queries";

export const dynamic = "force-dynamic";

export const GET = route(async ({ req }) => {
  const actor = await resolveActor(req);
  requireAccount(actor);
  const subject = actor.organizationId ? `org:${actor.organizationId}` : `user:${actor.userId}`;
  const usage = await usageFor(subject);
  return json({
    plan: actor.plan.id,
    period: currentPeriod(),
    secretsCreated: usage.secrets_created ?? 0,
    secretsPerMonth: actor.plan.limits.secretsPerMonth,
    limits: actor.plan.limits,
    secrets: await secretStats({ userId: actor.userId, organizationId: actor.organizationId }),
  });
});
