import { PLANS } from "@/config/plans";
import { receiptTokenFor } from "@/server/crypto";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { requireAccount, requireScope, resolveActor } from "@/server/http/actor";
import { assertSameOrigin, json, readJson, route } from "@/server/http/route";
import { withIdempotency } from "@/server/idempotency";
import { deliverWebhooksAfterResponse } from "@/server/jobs/runner";
import { enforceRateLimit, RULES } from "@/server/ratelimit";
import { listSecrets, listSecretsSchema } from "@/server/secrets/queries";
import { createSecret } from "@/server/secrets/service";

export const dynamic = "force-dynamic";

/** Create a secret from a client-side encrypted envelope. */
export const POST = route(async ({ req }) => {
  assertSameOrigin(req);
  const actor = await resolveActor(req);
  requireScope(actor, "secrets:create");

  if (actor.kind === "anonymous") await enforceRateLimit(RULES.createAnonymous, actor.ip);
  else if (actor.kind === "user")
    await enforceRateLimit(RULES.createAuthenticated, `user:${actor.userId}`);
  else
    await enforceRateLimit(
      { name: "api:create", limit: actor.plan.limits.apiRequestsPerMinute, windowSeconds: 60 },
      `key:${actor.keyId}`,
    );

  const body = await readJson(req);
  const plan = actor.kind === "anonymous" ? PLANS.anonymous : actor.plan;
  const owner =
    actor.kind === "anonymous"
      ? { userId: null, organizationId: null, apiKeyId: null, environment: "live" as const }
      : {
          userId: actor.userId,
          organizationId: actor.organizationId,
          apiKeyId: actor.kind === "apiKey" ? actor.keyId : null,
          environment: actor.kind === "apiKey" ? actor.environment : ("live" as const),
        };

  const idemKey = req.headers.get("idempotency-key");
  if (idemKey && actor.kind === "anonymous")
    throw new AppError("bad_request", "Idempotency keys require authentication.");
  const scope =
    actor.kind === "apiKey"
      ? `apikey:${actor.keyId}`
      : actor.kind === "user"
        ? `user:${actor.userId}`
        : "anonymous";

  const result = await withIdempotency(scope, idemKey, JSON.stringify(body), async () => {
    const created = await createSecret(body as never, { owner, plan });
    return {
      status: 201,
      body: {
        id: created.id,
        expiresAt: created.expiresAt.toISOString(),
        maxViews: created.maxViews,
      },
    };
  });

  deliverWebhooksAfterResponse();
  const id = result.body.id as string;
  return json(
    {
      ...result.body,
      receiptToken: receiptTokenFor(id),
      // The client appends `#<linkKey>`; the server never sees the key.
      shareUrlBase: `${env().APP_URL}/s/${id}`,
      receiptUrlBase: `${env().APP_URL}/receipt/${id}`,
    },
    { status: result.status, headers: result.replayed ? { "Idempotent-Replayed": "true" } : {} },
  );
});

/** List the caller's secrets (metadata only). */
export const GET = route(async ({ req }) => {
  const actor = await resolveActor(req);
  requireAccount(actor);
  requireScope(actor, "secrets:read");
  await enforceRateLimit(RULES.accountApi, `user:${actor.userId}`);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = listSecretsSchema.safeParse(params);
  if (!parsed.success) throw new AppError("validation_failed", "Invalid query parameters.");
  const query =
    actor.kind === "apiKey"
      ? { ...parsed.data, environment: parsed.data.environment ?? actor.environment }
      : parsed.data;
  return json(
    await listSecrets({ userId: actor.userId, organizationId: actor.organizationId }, query),
  );
});
