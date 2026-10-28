import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env, isTest } from "@/server/env";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Database = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type Transaction = PgTransaction<
  PgQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>;

type Driver = "postgres" | "pglite";

interface DbState {
  db: Database;
  driver: Driver;
  ready: Promise<void>;
  close: () => Promise<void>;
}

const globalForDb = globalThis as unknown as { __vaultdropDb?: DbState };

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

function create(): DbState {
  const url = isTest() ? process.env.TEST_DATABASE_URL : env().DATABASE_URL;

  if (url) {
    const client = postgres(url, {
      max: env().DATABASE_POOL_MAX,
      idle_timeout: 30,
      connect_timeout: 10,
      prepare: true,
      onnotice: () => {},
      connection: { statement_timeout: 10_000, idle_in_transaction_session_timeout: 15_000 },
    });
    const db = drizzlePostgres(client, { schema }) as unknown as Database;
    return {
      db,
      driver: "postgres",
      ready: Promise.resolve(),
      close: () => client.end({ timeout: 5 }),
    };
  }

  // VAULTDROP_ALLOW_EMBEDDED_DB=1 exists only to smoke-test a production build locally.
  if (
    env().NODE_ENV === "production" &&
    !isTest() &&
    process.env.VAULTDROP_ALLOW_EMBEDDED_DB !== "1"
  ) {
    throw new Error(
      "DATABASE_URL is required in production; the embedded PGlite database is for development only.",
    );
  }

  let client: PGlite;
  if (isTest()) client = new PGlite();
  else {
    const dir = path.resolve(env().PGLITE_DATA_DIR);
    mkdirSync(path.dirname(dir), { recursive: true });
    client = new PGlite(dir);
  }
  const pgliteDb = drizzlePglite(client, { schema });
  // The embedded database migrates itself so `bun run dev` works with zero setup.
  const ready = migratePglite(pgliteDb, { migrationsFolder: MIGRATIONS_FOLDER });
  ready.catch(() => {
    // Do not cache a failed initialisation forever; the next call retries.
    if (globalForDb.__vaultdropDb?.ready === ready) globalForDb.__vaultdropDb = undefined;
  });
  return {
    db: pgliteDb as unknown as Database,
    driver: "pglite",
    ready,
    close: () => client.close(),
  };
}

function state(): DbState {
  globalForDb.__vaultdropDb ??= create();
  return globalForDb.__vaultdropDb;
}

/** Returns the database once it is ready (migrations applied for the embedded driver). */
export async function getDb(): Promise<Database> {
  const s = state();
  await s.ready;
  return s.db;
}

/** Synchronous access for libraries that need a handle at construction time (Better Auth). */
export function dbHandle(): Database {
  return state().db;
}

export function dbDriver(): Driver {
  return state().driver;
}

export async function closeDb(): Promise<void> {
  const s = globalForDb.__vaultdropDb;
  globalForDb.__vaultdropDb = undefined;
  if (s) await s.close();
}
