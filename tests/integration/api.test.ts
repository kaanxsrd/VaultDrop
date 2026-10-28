import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as keysRoute from "@/app/api/v1/account/api-keys/route";
import * as usageRoute from "@/app/api/v1/account/usage/route";
import * as burnRoute from "@/app/api/v1/secrets/[id]/burn/route";
import * as redeemRoute from "@/app/api/v1/secrets/[id]/redeem/route";
import * as receiptRoute from "@/app/api/v1/secrets/[id]/route";
import * as statusRoute from "@/app/api/v1/secrets/[id]/status/route";
import * as secretsRoute from "@/app/api/v1/secrets/route";
import { PLANS } from "@/config/plans";
import { deriveKeys, openEnvelope, sealSecret } from "@/lib/crypto/envelope";
import { buildOpenApi } from "@/lib/openapi";
import { createApiKey } from "@/server/apikeys";
import { closeDb, getDb } from "@/server/db/client";
import { subscriptions, user } from "@/server/db/schema";
import { call } from "../support/http";

process.env.TRUST_PROXY = "true";

let aliceKey: string;
let bobKey: string;
let aliceTestKey: string;
let readOnlyKey: string;

beforeAll(async () => {
  const db = await getDb();
  await db.insert(user).values([
    {
      id: "u_alice",
      name: "Alice",
      email: "alice@api.test",
      emailVerified: true,
      updatedAt: new Date(),
    },
    { id: "u_bob", name: "Bob", email: "bob@api.test", emailVerified: true, updatedAt: new Date() },
    {
      id: "u_free",
      name: "Free",
      email: "free@api.test",
      emailVerified: true,
      updatedAt: new Date(),
    },
  ]);
  await db.insert(subscriptions).values([
    { id: "sub_a", subject: "user:u_alice", plan: "pro", status: "active" },
    { id: "sub_b", subject: "user:u_bob", plan: "pro", status: "active" },
  ]);
  aliceKey = (await createApiKey("u_alice", PLANS.pro, { name: "ci" })).token;
  aliceTestKey = (await createApiKey("u_alice", PLANS.pro, { name: "test", environment: "test" }))
    .token;
  bobKey = (await createApiKey("u_bob", PLANS.pro, { name: "bob" })).token;
  readOnlyKey = (await createApiKey("u_alice", PLANS.pro, { name: "ro", scopes: ["secrets:read"] }))
    .token;
});

afterAll(async () => {
  await closeDb();
});

async function sealedBody(
  text = "api secret",
  extra: Record<string, unknown> = {},
  passphrase?: string,
) {
  const sealed = await sealSecret(text, { passphrase });
  return {
    sealed,
    body: {
      envelope: sealed.envelope,
      kdf: sealed.kdf,
      verifier: sealed.verifier,
      expiresIn: 3600,
      ...extra,
    },
  };
}

describe("POST /api/v1/secrets → status → redeem", () => {
  it("runs the full anonymous lifecycle over HTTP", async () => {
    const { sealed, body } = await sealedBody("over http");
    const created = await call(secretsRoute.POST, { body, path: "/api/v1/secrets" });
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toContain("no-store");
    expect(created.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const id = created.json.id as string;
    expect(created.json.shareUrlBase).toBe(`http://localhost:3000/s/${id}`);
    expect(JSON.stringify(created.json)).not.toContain(sealed.linkKey);

    const status = await call(statusRoute.GET, { params: { id } });
    expect(status.json).toMatchObject({
      state: "active",
      requiresPassphrase: false,
      viewsRemaining: 1,
    });

    const keys = await deriveKeys(sealed.linkKey, null);
    const redeemed = await call(redeemRoute.POST, {
      params: { id },
      body: { proof: keys.authProof },
    });
    expect(redeemed.status).toBe(200);
    expect(await openEnvelope(redeemed.json.envelope, keys.encKey)).toBe("over http");

    const again = await call(redeemRoute.POST, { params: { id }, body: { proof: keys.authProof } });
    expect(again.status).toBe(410);
    expect(again.json.error).toMatchObject({
      code: "secret_unavailable",
      details: { state: "consumed" },
    });
  });

  it("returns 403 with attemptsRemaining for a wrong passphrase and keeps the secret", async () => {
    const { sealed, body } = await sealedBody("pp", {}, "right");
    const { json } = await call(secretsRoute.POST, { body });
    const wrong = await deriveKeys(sealed.linkKey, sealed.kdf, "wrong");
    const res = await call(redeemRoute.POST, {
      params: { id: json.id },
      body: { proof: wrong.authProof },
    });
    expect(res.status).toBe(403);
    expect(res.json.error).toMatchObject({
      code: "invalid_proof",
      details: { attemptsRemaining: 9 },
    });
    const status = await call(statusRoute.GET, { params: { id: json.id } });
    expect(status.json.state).toBe("active");
  });

  it("validates input and never echoes stack traces", async () => {
    const res = await call(secretsRoute.POST, {
      body: { envelope: { v: 1, iv: "x", ct: "y" }, verifier: "z", expiresIn: 5 },
    });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("validation_failed");
    expect(JSON.stringify(res.json)).not.toMatch(/at \w+ \(|node_modules/);

    const notJson = await call(secretsRoute.POST, { body: "{not json" });
    expect(notJson.status).toBe(400);

    const badId = await call(statusRoute.GET, { params: { id: "../../etc/passwd" } });
    expect(badId.status).toBe(404);
  });

  it("rejects bodies over the hard size limit", async () => {
    const res = await call(secretsRoute.POST, { body: { pad: "x".repeat(2 * 1024 * 1024 + 10) } });
    expect(res.status).toBe(413);
  });

  it("rejects cross-site cookie requests (CSRF)", async () => {
    const { body } = await sealedBody();
    const res = await call(secretsRoute.POST, {
      body,
      headers: { origin: "https://evil.example", cookie: "x=1" },
    });
    expect(res.status).toBe(403);
    const fetchSite = await call(secretsRoute.POST, {
      body,
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(fetchSite.status).toBe(403);
  });
});

describe("rate limiting", () => {
  it("limits anonymous creation per client IP and reports Retry-After", async () => {
    const { body } = await sealedBody();
    const ip = "198.51.100.77";
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++)
      statuses.push((await call(secretsRoute.POST, { body, ip })).status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(20);
    const limited = await call(secretsRoute.POST, { body, ip });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // A different client is unaffected.
    expect((await call(secretsRoute.POST, { body, ip: "198.51.100.78" })).status).toBe(201);
  });

  it("limits redemption attempts per secret regardless of client IP", async () => {
    const { body } = await sealedBody("brute", {}, "pw");
    const { json } = await call(secretsRoute.POST, { body });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push(
        (
          await call(redeemRoute.POST, {
            params: { id: json.id },
            body: { proof: "A".repeat(43) },
            ip: `203.0.113.${i + 1}`,
          })
        ).status,
      );
    }
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("API keys and authorization", () => {
  it("authenticates API keys, records ownership and enforces scopes", async () => {
    const { body } = await sealedBody("from ci", { label: "deploy key", maxViews: 3 });
    const created = await call(secretsRoute.POST, {
      body,
      headers: { authorization: `Bearer ${aliceKey}` },
    });
    expect(created.status).toBe(201);

    const receipt = await call(receiptRoute.GET, {
      params: { id: created.json.id },
      headers: { authorization: `Bearer ${aliceKey}` },
    });
    expect(receipt.json).toMatchObject({ label: "deploy key", maxViews: 3, state: "active" });

    const ro = await call(secretsRoute.POST, {
      body,
      headers: { authorization: `Bearer ${readOnlyKey}` },
    });
    expect(ro.status).toBe(403);
    expect(ro.json.error.message).toContain("secrets:create");

    const bad = await call(secretsRoute.POST, {
      body,
      headers: { authorization: `Bearer vd_live_${"x".repeat(43)}` },
    });
    expect(bad.status).toBe(401);
  });

  it("isolates tenants: Bob cannot read, list or burn Alice's secrets", async () => {
    const { body } = await sealedBody("alice private", { label: "alice-only" });
    const { json } = await call(secretsRoute.POST, {
      body,
      headers: { authorization: `Bearer ${aliceKey}` },
    });
    const asBob = { authorization: `Bearer ${bobKey}` };
    expect((await call(receiptRoute.GET, { params: { id: json.id }, headers: asBob })).status).toBe(
      404,
    );
    expect((await call(burnRoute.POST, { params: { id: json.id }, headers: asBob })).status).toBe(
      404,
    );
    const list = await call(secretsRoute.GET, {
      path: "/api/v1/secrets?q=alice-only",
      headers: asBob,
    });
    expect(list.json.total).toBe(0);
    const aliceList = await call(secretsRoute.GET, {
      path: "/api/v1/secrets?q=alice-only",
      headers: { authorization: `Bearer ${aliceKey}` },
    });
    expect(aliceList.json.total).toBe(1);
  });

  it("scopes test-environment keys to test secrets", async () => {
    const { body } = await sealedBody("test env");
    const created = await call(secretsRoute.POST, {
      body,
      headers: { authorization: `Bearer ${aliceTestKey}` },
    });
    expect(created.status).toBe(201);
    const testList = await call(secretsRoute.GET, {
      path: "/api/v1/secrets",
      headers: { authorization: `Bearer ${aliceTestKey}` },
    });
    expect(testList.json.items.every((s: { id: string }) => typeof s.id === "string")).toBe(true);
    expect(testList.json.items.map((s: { id: string }) => s.id)).toContain(created.json.id);
    const liveList = await call(secretsRoute.GET, {
      path: "/api/v1/secrets?pageSize=100",
      headers: { authorization: `Bearer ${aliceKey}` },
    });
    expect(liveList.json.items.map((s: { id: string }) => s.id)).not.toContain(created.json.id);
  });

  it("stores API keys hashed and never returns them again", async () => {
    const db = await getDb();
    const { apiKeys } = await import("@/server/db/schema");
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.userId, "u_alice"));
    for (const r of rows) {
      expect(r.tokenHash).not.toContain("vd_");
      expect(
        aliceKey.startsWith(r.prefix) ||
          aliceTestKey.startsWith(r.prefix) ||
          readOnlyKey.startsWith(r.prefix),
      ).toBe(true);
    }
  });

  it("does not allow API keys to manage API keys (session only)", async () => {
    const res = await call(keysRoute.POST, {
      body: { name: "escalate" },
      headers: { authorization: `Bearer ${aliceKey}` },
    });
    expect(res.status).toBe(401);
  });

  it("enforces plan entitlements for API access", async () => {
    await expect(createApiKey("u_free", PLANS.free, { name: "nope" })).rejects.toMatchObject({
      code: "plan_restricted",
    });
  });

  it("reports usage against the plan", async () => {
    const res = await call(usageRoute.GET, { headers: { authorization: `Bearer ${aliceKey}` } });
    expect(res.json.plan).toBe("pro");
    expect(res.json.secretsCreated).toBeGreaterThan(0);
  });
});

describe("idempotency", () => {
  it("replays the original response for the same key and body", async () => {
    const { body } = await sealedBody("idem");
    const headers = {
      authorization: `Bearer ${aliceKey}`,
      "idempotency-key": "deploy-2026-10-28-001",
    };
    const first = await call(secretsRoute.POST, { body, headers });
    const second = await call(secretsRoute.POST, { body, headers });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.json.id).toBe(first.json.id);
    expect(second.json.receiptToken).toBe(first.json.receiptToken);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
  });

  it("rejects reuse of a key with a different body", async () => {
    const headers = {
      authorization: `Bearer ${aliceKey}`,
      "idempotency-key": "deploy-2026-10-28-002",
    };
    await call(secretsRoute.POST, { body: (await sealedBody("a")).body, headers });
    const res = await call(secretsRoute.POST, { body: (await sealedBody("b")).body, headers });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("idempotency_mismatch");
  });
});

describe("receipt tokens", () => {
  it("authorize receipt and burn for anonymous creators, and nothing else", async () => {
    const { sealed, body } = await sealedBody("anon burn");
    const { json } = await call(secretsRoute.POST, { body });
    const other = await call(secretsRoute.POST, { body: (await sealedBody()).body });
    expect(
      (
        await call(receiptRoute.GET, {
          params: { id: json.id },
          headers: { "x-receipt-token": other.json.receiptToken },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(receiptRoute.GET, {
          params: { id: json.id },
          headers: { "x-receipt-token": json.receiptToken },
        })
      ).json.state,
    ).toBe("active");
    const burned = await call(burnRoute.POST, {
      params: { id: json.id },
      headers: { "x-receipt-token": json.receiptToken },
    });
    expect(burned.json.state).toBe("revoked");
    const keys = await deriveKeys(sealed.linkKey, null);
    expect(
      (await call(redeemRoute.POST, { params: { id: json.id }, body: { proof: keys.authProof } }))
        .json.error.details.state,
    ).toBe("revoked");
  });
});

describe("OpenAPI", () => {
  it("documents every public v1 route", () => {
    const doc = buildOpenApi("http://localhost:3000");
    for (const p of [
      "/secrets",
      "/secrets/{id}",
      "/secrets/{id}/status",
      "/secrets/{id}/redeem",
      "/secrets/{id}/burn",
      "/account/usage",
      "/account/api-keys",
      "/account/api-keys/{keyId}",
      "/webhooks",
      "/webhooks/{id}",
    ]) {
      expect(doc.paths).toHaveProperty(p);
    }
  });
});
