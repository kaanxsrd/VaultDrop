import "server-only";
import type { RateLimitRule as GroundworkRule } from "@vantedev/groundwork/rate-limit";
import { AppError } from "@/server/errors";
import { gw } from "@/server/groundwork";

export interface RateLimitRule {
  /** Logical bucket name, e.g. "secret:create:ip". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed windows counted by groundwork in Postgres (or Redis), correct across instances. Subjects
 * are stored as HMACs, never as IPs or ids. A rule's limit may vary per caller (an API key's
 * plan), so each name, limit and window gets its own groundwork rule.
 */
const rules = new Map<string, Promise<GroundworkRule>>();

function ruleFor({ name, limit, windowSeconds }: RateLimitRule): Promise<GroundworkRule> {
  const id = `${name}:${limit}per${windowSeconds}s`;
  let rule = rules.get(id);
  if (!rule) {
    rule = gw()
      .then((g) => g.rateLimit.rule({ name: id, limit, window: `${windowSeconds}s` }))
      .catch((error: unknown) => {
        rules.delete(id);
        throw error;
      });
    rules.set(id, rule);
  }
  return rule;
}

export async function checkRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult & { retryAfterMs: number }> {
  const result = await (await ruleFor(rule)).check(subject);
  return {
    allowed: result.allowed,
    limit: result.limit,
    remaining: result.remaining,
    resetAt: result.resetAt.getTime(),
    retryAfterMs: result.retryAfterMs,
  };
}

/** Throws a 429 AppError with standard headers when the limit is exceeded. */
export async function enforceRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const result = await checkRateLimit(rule, subject);
  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    throw new AppError(
      "rate_limited",
      "Too many requests. Please wait a moment and try again.",
      { retryAfter },
      {
        "Retry-After": String(retryAfter),
        "RateLimit-Limit": String(result.limit),
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": String(retryAfter),
      },
    );
  }
  return result;
}

/** Deletes expired counters; returns how many. */
export async function purgeExpiredRateLimits(): Promise<number> {
  return (await gw()).rateLimit.cleanup();
}

export const RULES = {
  createAnonymous: { name: "secret:create:anon", limit: 20, windowSeconds: 600 },
  createAuthenticated: { name: "secret:create:user", limit: 120, windowSeconds: 600 },
  status: { name: "secret:status:ip", limit: 120, windowSeconds: 60 },
  redeemIp: { name: "secret:redeem:ip", limit: 30, windowSeconds: 60 },
  redeemSecret: { name: "secret:redeem:id", limit: 10, windowSeconds: 60 },
  burn: { name: "secret:burn:ip", limit: 30, windowSeconds: 60 },
  receipt: { name: "secret:receipt:ip", limit: 60, windowSeconds: 60 },
  accountApi: { name: "account:api", limit: 120, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;
