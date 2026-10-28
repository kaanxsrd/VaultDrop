import "server-only";
import { lt, sql } from "drizzle-orm";
import { pseudonymize } from "@/server/crypto";
import { getDb } from "@/server/db/client";
import { rateLimits } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { errorInfo, logger } from "@/server/log";

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

interface Backend {
  hit(key: string, windowStart: number, windowSeconds: number): Promise<number>;
}

/** Postgres fixed-window counter: correct across instances, no extra infrastructure. */
const postgresBackend: Backend = {
  async hit(key, windowStart, windowSeconds) {
    const db = await getDb();
    const expiresAt = new Date((windowStart + windowSeconds) * 1000);
    const [row] = await db
      .insert(rateLimits)
      .values({ key, windowStart, count: 1, expiresAt })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`CASE WHEN ${rateLimits.windowStart} = excluded.window_start THEN ${rateLimits.count} + 1 ELSE 1 END`,
          windowStart: sql`excluded.window_start`,
          expiresAt: sql`excluded.expires_at`,
        },
      })
      .returning({ count: rateLimits.count });
    return row!.count;
  },
};

const REDIS_SCRIPT = `local c = redis.call('INCR', KEYS[1]) if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return c`;

type RedisLike = {
  eval: (script: string, numKeys: number, ...args: (string | number)[]) => Promise<unknown>;
};
let redisClient: RedisLike | null = null;

async function redisBackend(url: string): Promise<Backend> {
  if (!redisClient) {
    const { default: Redis } = await import("ioredis");
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    }) as unknown as RedisLike;
  }
  const client = redisClient;
  return {
    async hit(key, windowStart, windowSeconds) {
      return Number(
        await client.eval(REDIS_SCRIPT, 1, `vd:rl:${key}:${windowStart}`, windowSeconds + 1),
      );
    },
  };
}

async function backend(): Promise<Backend> {
  const url = env().REDIS_URL;
  return url ? redisBackend(url) : postgresBackend;
}

export async function checkRateLimit(
  rule: RateLimitRule,
  subject: string,
  nowMs = Date.now(),
): Promise<RateLimitResult> {
  const windowStart = Math.floor(nowMs / 1000 / rule.windowSeconds) * rule.windowSeconds;
  const key = `${rule.name}:${pseudonymize("ratelimit", subject)}`;
  let count: number;
  try {
    count = await (await backend()).hit(key, windowStart, rule.windowSeconds);
  } catch (error) {
    // Redis outage: fall back to Postgres rather than failing open.
    logger.warn(
      { err: errorInfo(error), rule: rule.name },
      "rate limit backend failed; using postgres",
    );
    count = await postgresBackend.hit(key, windowStart, rule.windowSeconds);
  }
  return {
    allowed: count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt: (windowStart + rule.windowSeconds) * 1000,
  };
}

/** Throws a 429 AppError with standard headers when the limit is exceeded. */
export async function enforceRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const result = await checkRateLimit(rule, subject);
  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
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

export async function purgeExpiredRateLimits(now = new Date()): Promise<number> {
  const db = await getDb();
  const rows = await db
    .delete(rateLimits)
    .where(lt(rateLimits.expiresAt, now))
    .returning({ key: rateLimits.key });
  return rows.length;
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
