/**
 * When TEST_DATABASE_URL points at a real PostgreSQL server (CI), recreate the schema and apply
 * migrations once before the run. Without it, every test file gets its own in-memory PGlite.
 */
import path from "node:path";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(
      "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
    );
    await migrate(drizzle(sql), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  } finally {
    await sql.end();
  }
}
