/**
 * Development seed: an admin on the Pro plan and a regular Free user, both with verified emails.
 * Refuses to run in production. Passwords come from SEED_PASSWORD (default shown below).
 *
 *   bun run db:migrate && bun run db:seed
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { hash } from "@node-rs/argon2";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { account, subscriptions, user } from "../src/server/db/schema";

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Refusing to seed a production database.");
  const password = process.env.SEED_PASSWORD ?? "vaultdrop-dev-password";
  const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

  let db: PgDatabase<PgQueryResultHKT>;
  let close: () => Promise<void>;
  if (process.env.DATABASE_URL) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(process.env.DATABASE_URL, { max: 1 });
    db = drizzle(client) as never;
    close = () => client.end();
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite(path.resolve(process.env.PGLITE_DATA_DIR ?? ".data/pglite"));
    db = drizzle(client) as never;
    close = () => client.close();
  }

  const people = [
    { email: "admin@vaultdrop.local", name: "Ada Admin", role: "admin", plan: "pro" },
    { email: "member@vaultdrop.local", name: "Max Member", role: "user", plan: null },
  ];
  try {
    for (const p of people) {
      const id = randomUUID();
      const now = new Date();
      const inserted = await db
        .insert(user)
        .values({
          id,
          name: p.name,
          email: p.email,
          emailVerified: true,
          role: p.role,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: user.id });
      if (inserted.length === 0) {
        console.log(`exists: ${p.email}`);
        continue;
      }
      await db.insert(account).values({
        id: randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      });
      if (p.plan)
        await db.insert(subscriptions).values({
          id: `sub_seed_${id.slice(0, 8)}`,
          subject: `user:${id}`,
          plan: p.plan,
          status: "active",
        });
      console.log(`created: ${p.email} (${p.role}${p.plan ? `, ${p.plan}` : ""})`);
    }
    console.log(`\nSign in with password: ${password}`);
  } finally {
    await close();
  }
}

main().catch((e: unknown) => {
  console.error("Seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
