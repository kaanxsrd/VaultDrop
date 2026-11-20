import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLANS } from "@/config/plans";
import { closeDb, getDb } from "@/server/db/client";
import {
  gwJobs,
  notifications,
  subscriptions,
  user,
  webhookDeliveries,
  webhookEndpoints,
} from "@/server/db/schema";
import { JOBS, jobHealth, runJob } from "@/server/jobs/runner";
import { burnSecret, redeemSecret } from "@/server/secrets/service";
import {
  createWebhookEndpoint,
  deliverDueWebhooks,
  isPrivateAddress,
  signPayload,
  verifySignature,
} from "@/server/webhooks";
import { makeSecret } from "../support/factories";

const owner = {
  userId: "u_hook",
  organizationId: null,
  apiKeyId: null,
  environment: "live" as const,
};
let signingSecret: string;

beforeAll(async () => {
  const db = await getDb();
  await db
    .insert(user)
    .values({ id: "u_hook", name: "Hook", email: "hook@test", updatedAt: new Date() });
  await db
    .insert(subscriptions)
    .values({ id: "s_h", subject: "user:u_hook", plan: "pro", status: "active" });
  const created = await createWebhookEndpoint(
    "u_hook",
    PLANS.pro,
    { url: "http://localhost:9/hook" },
    null,
  );
  signingSecret = created.secret;
});

afterAll(async () => {
  await closeDb();
});

describe("webhook signatures", () => {
  it("verifies valid signatures and rejects tampering and replays", () => {
    const body = JSON.stringify({ id: "evt_1", type: "secret.consumed" });
    const now = 1_800_000_000;
    const header = signPayload("whsec_test", body, now);
    expect(verifySignature("whsec_test", header, body, now)).toBe(true);
    expect(verifySignature("whsec_test", header, body.replace("consumed", "created"), now)).toBe(
      false,
    );
    expect(verifySignature("whsec_other", header, body, now)).toBe(false);
    expect(verifySignature("whsec_test", header, body, now + 301)).toBe(false); // replay window
    expect(verifySignature("whsec_test", "garbage", body, now)).toBe(false);
  });

  it("blocks private and loopback targets (SSRF)", () => {
    for (const ip of [
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "192.168.1.1",
      "172.16.5.4",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
      "100.64.0.1",
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
      expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("transactional outbox and delivery", () => {
  it("emits metadata-only events and notifications on lifecycle changes", async () => {
    const s = await makeSecret("webhook-plaintext-marker", { owner, label: "hook test" });
    await redeemSecret(s.id, s.proof);
    const db = await getDb();
    const deliveries = await db.select().from(webhookDeliveries);
    const types = deliveries.map((d) => d.eventType);
    expect(types).toContain("secret.created");
    expect(types).toContain("secret.consumed");
    const all = JSON.stringify(deliveries);
    expect(all).not.toContain("webhook-plaintext-marker");
    expect(all).not.toContain(s.sealed.linkKey);
    expect(all).not.toContain(s.sealed.envelope.ct);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, "u_hook"));
    expect(notes.some((n) => n.kind === "secret.consumed")).toBe(true);
  });

  it("signs deliveries, retries failures with backoff, and marks success", async () => {
    const db = await getDb();
    await db.delete(webhookDeliveries);
    const s = await makeSecret("x", { owner });
    await burnSecret(s.id, { kind: "owner", userId: "u_hook" });

    const seen: { headers: Record<string, string>; body: string }[] = [];
    let fail = true;
    const send = async (_url: string, init: RequestInit) => {
      seen.push({ headers: init.headers as Record<string, string>, body: String(init.body) });
      return { status: fail ? 500 : 204 };
    };

    const t0 = new Date();
    const first = await deliverDueWebhooks({ now: t0, send });
    expect(first.failed).toBeGreaterThan(0);
    const failed = await db.select().from(webhookDeliveries);
    expect(
      failed.every((d) => d.status === "failed" && d.attempts === 1 && d.nextAttemptAt > t0),
    ).toBe(true);

    // Not due yet: nothing is re-sent immediately.
    expect(
      (await deliverDueWebhooks({ now: t0, send })).delivered +
        (await deliverDueWebhooks({ now: t0, send })).failed,
    ).toBe(0);

    fail = false;
    const later = new Date(t0.getTime() + 2 * 60_000);
    const second = await deliverDueWebhooks({ now: later, send });
    expect(second.delivered).toBe(failed.length);
    const done = await db.select().from(webhookDeliveries);
    expect(done.every((d) => d.status === "succeeded" && d.attempts === 2)).toBe(true);

    const last = seen.at(-1)!;
    expect(
      verifySignature(
        signingSecret,
        last.headers["VaultDrop-Signature"]!,
        last.body,
        Math.floor(later.getTime() / 1000),
      ),
    ).toBe(true);
    expect(last.headers["VaultDrop-Event-Id"]).toMatch(/^evt_/);
  });

  it("stores the signing secret encrypted at rest", async () => {
    const db = await getDb();
    const [row] = await db.select().from(webhookEndpoints);
    expect(row!.secretEncrypted).not.toContain(signingSecret);
    expect(row!.secretEncrypted.startsWith("v1.")).toBe(true);
  });
});

describe("job runner", () => {
  it("records successful runs and reports health", async () => {
    const result = await runJob("expire-secrets");
    expect(result.ok).toBe(true);
    const health = await jobHealth();
    expect(health.find((h) => h.job === "expire-secrets")?.healthy).toBe(true);
  });

  it("retries a failed run later and records the failure", async () => {
    const original = JOBS["purge-metadata"].run;
    let calls = 0;
    JOBS["purge-metadata"].run = async () => {
      calls++;
      if (calls < 2) throw new Error("transient database error");
      return { purged: 0 };
    };
    try {
      const failed = await runJob("purge-metadata");
      expect(failed).toMatchObject({ ok: false, attempts: 1 });
      expect(failed.error).toContain("transient database error");
      const health = await jobHealth();
      expect(health.find((h) => h.job === "purge-metadata")?.lastFailureAt).not.toBeNull();

      // The retry waits out its backoff; make it due now.
      const db = await getDb();
      await db
        .update(gwJobs)
        .set({ runAt: new Date() })
        .where(eq(gwJobs.type, "schedule:purge-metadata"));
      const retried = await runJob("purge-metadata");
      expect(retried).toMatchObject({ ok: true, attempts: 2 });
      expect(calls).toBe(2);
    } finally {
      JOBS["purge-metadata"].run = original;
    }
  });
});
