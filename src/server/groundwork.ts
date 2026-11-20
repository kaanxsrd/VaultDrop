import "server-only";
import { createGroundwork, type Logger } from "@vantedev/groundwork";
import { redisStore } from "@vantedev/groundwork/rate-limit";
import { getDb } from "@/server/db/client";
import { gwIdempotencyKeys, gwRateLimits } from "@/server/db/schema";
import { env } from "@/server/env";
import { logger } from "@/server/log";

/** groundwork logs `(message, context)`; pino takes `(context, message)`. */
const groundworkLogger: Logger = {
  info: (message, context) => logger.info(context ?? {}, message),
  warn: (message, context) => logger.warn(context ?? {}, message),
  error: (message, context) => logger.error(context ?? {}, message),
};

async function create() {
  const url = env().REDIS_URL;
  // Counters live in Postgres, or in Redis when REDIS_URL is set. If the store fails, limits keep
  // holding per instance in memory until it's back.
  const store = url ? redisStore({ client: await redisClient(url) }) : undefined;
  return createGroundwork({
    db: await getDb(),
    tables: { rateLimits: gwRateLimits, idempotencyKeys: gwIdempotencyKeys },
    // groundwork derives its own keys from APP_SECRET (HKDF), so no new setting is needed.
    secret: env().APP_SECRET,
    logger: groundworkLogger,
    ...(store ? { rateLimit: { store } } : {}),
  });
}

async function redisClient(url: string) {
  const { default: Redis } = await import("ioredis");
  const redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  return {
    eval: (script: string, keys: string[], args: string[]) =>
      redis.eval(script, keys.length, ...keys, ...args),
  };
}

type Groundwork = Awaited<ReturnType<typeof create>>;

const globalForGroundwork = globalThis as unknown as {
  __vaultdropGroundwork?: Promise<Groundwork>;
};

/** The app's groundwork instance, created on first use like the database. */
export function gw(): Promise<Groundwork> {
  globalForGroundwork.__vaultdropGroundwork ??= create().catch((error: unknown) => {
    // Let the next call try again instead of failing forever.
    globalForGroundwork.__vaultdropGroundwork = undefined;
    throw error;
  });
  return globalForGroundwork.__vaultdropGroundwork;
}
