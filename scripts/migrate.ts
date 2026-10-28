/**
 * Applies pending SQL migrations from ./drizzle.
 *   DATABASE_URL_UNPOOLED / DATABASE_URL set → migrates that PostgreSQL database
 *   neither set                              → migrates the embedded PGlite database in PGLITE_DATA_DIR
 *
 * For PostgreSQL it also sets database-level safety timeouts. Connection poolers such as Neon's
 * PgBouncer silently ignore per-connection startup parameters, so the database default is the only
 * reliable way to bound how long a query or an idle transaction (holding redemption row locks) lives.
 */
import path from "node:path";

const migrationsFolder = path.join(process.cwd(), "drizzle");

const RUNTIME_SETTINGS = {
  statement_timeout: "15s",
  idle_in_transaction_session_timeout: "20s",
  lock_timeout: "10s",
} as const;

async function main() {
  // Migrations prefer a direct connection; DDL through a transaction-mode pooler is discouraged.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 1, onnotice: () => {} });
    try {
      // This session only: long-running DDL must not hit the runtime limits set below.
      await client`SET statement_timeout = 0`;
      await client`SET lock_timeout = 0`;
      await migrate(drizzle(client), { migrationsFolder });
      console.log(`Migrations applied to PostgreSQL (${new URL(url).hostname}).`);

      for (const [name, value] of Object.entries(RUNTIME_SETTINGS)) {
        try {
          await client.unsafe(
            `DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET ${name} = %L', current_database(), '${value}'); END $$;`,
          );
          console.log(`  database default ${name} = ${value}`);
        } catch (error) {
          console.warn(
            `  could not set ${name} (needs database ownership): ${(error as Error).message}`,
          );
        }
      }
    } finally {
      await client.end();
    }
    return;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = path.resolve(process.env.PGLITE_DATA_DIR ?? ".data/pglite");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.close();
  }
  console.log(`Migrations applied to embedded PGlite database at ${dir}.`);
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
