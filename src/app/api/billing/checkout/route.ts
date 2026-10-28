import { z } from "zod";
import { getAuth } from "@/server/auth/auth";
import { createCheckoutSession, createPortalSession } from "@/server/billing";
import { AppError } from "@/server/errors";
import { assertSameOrigin, json, readJson, route } from "@/server/http/route";

export const dynamic = "force-dynamic";

const body = z.object({ action: z.enum(["checkout", "portal"]), plan: z.string().optional() });

/** Returns a Stripe-hosted URL for checkout or the customer portal. */
export const POST = route(async ({ req }) => {
  assertSameOrigin(req);
  const session = await getAuth().api.getSession({ headers: req.headers });
  if (!session) throw new AppError("unauthorized", "Sign in required.");
  const parsed = body.safeParse(await readJson(req, 1024));
  if (!parsed.success) throw new AppError("validation_failed", "Invalid billing request.");
  const orgId = session.session.activeOrganizationId ?? null;
  const url =
    parsed.data.action === "checkout"
      ? await createCheckoutSession(
          { userId: session.user.id, email: session.user.email, organizationId: orgId },
          parsed.data.plan ?? "",
        )
      : await createPortalSession(orgId ? `org:${orgId}` : `user:${session.user.id}`);
  return json({ url });
});
