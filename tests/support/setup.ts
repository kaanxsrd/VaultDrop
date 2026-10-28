import { beforeAll } from "vitest";

// Tests run against an isolated in-memory PGlite database unless TEST_DATABASE_URL is set.
process.env.VAULTDROP_TEST = "1";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0123456789";
process.env.APP_SECRET ??= "test-app-secret-test-app-secret-0123456789abcdef";
process.env.APP_URL ??= "http://localhost:3000";
process.env.LOG_LEVEL ??= "silent";

if (process.env.TEST_DATABASE_URL) {
  // Shared real Postgres: start every test file from empty tables (files run sequentially).
  beforeAll(async () => {
    const { getDb } = await import("@/server/db/client");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    const tables = await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    );
    const names = (
      Array.isArray(tables) ? tables : (tables as { rows: { tablename: string }[] }).rows
    ).map((t) => `"${t.tablename}"`);
    if (names.length)
      await db.execute(sql.raw(`TRUNCATE ${names.join(", ")} RESTART IDENTITY CASCADE`));
  });
}
