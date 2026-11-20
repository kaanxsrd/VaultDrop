import "server-only";
import { createGroundwork, type Logger } from "@vantedev/groundwork";
import { redisStore } from "@vantedev/groundwork/rate-limit";
import { type Database, getDb } from "@/server/db/client";
import { gwIdempotencyKeys, gwJobSchedules, gwJobs, gwRateLimits } from "@/server/db/schema";
import { env } from "@/server/env";
import { logger } from "@/server/log";

/** groundwork logs `(message, context)`; pino takes `(context, message)`. */
const groundworkLogger: Logger = {
  info: (message, context) => logger.info(context ?? {}, message),
  warn: (message, context) => logger.warn(context ?? {}, message),
  error: (message, context) => logger.error(context ?? {}, message),
};

async function create(db: Database) {
  const url = env().REDIS_URL;
  // Counters live in Postgres, or in Redis when REDIS_URL is set. If the store fails, limits keep
  // holding per instance in memory until it's back.
  const store = url ? redisStore({ client: await redisClient(url) }) : undefined;
  return createGroundwork({
    db,
    tables: {
      rateLimits: gwRateLimits,
      idempotencyKeys: gwIdempotencyKeys,
      jobs: gwJobs,
      jobSchedules: gwJobSchedules,
    },
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
  __vaultdropGroundwork?: { db: Database; instance: Promise<Groundwork> };
};

/** The app's groundwork instance, created on first use for the current database connection. */
export async function gw(): Promise<Groundwork> {
  const db = await getDb();
  const cached = globalForGroundwork.__vaultdropGroundwork;
  if (cached?.db === db) return cached.instance;
  const instance = create(db).catch((error: unknown) => {
    // Let the next call try again instead of failing forever.
    if (globalForGroundwork.__vaultdropGroundwork?.instance === instance) {
      globalForGroundwork.__vaultdropGroundwork = undefined;
    }
    throw error;
  });
  globalForGroundwork.__vaultdropGroundwork = { db, instance };
  return instance;
}
