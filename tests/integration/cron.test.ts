import { afterAll, describe, expect, it } from "vitest";
import * as jobsRoute from "@/app/api/internal/jobs/route";
import { closeDb } from "@/server/db/client";
import { call } from "../support/http";

// Must be set before the config is first read.
const CRON_SECRET = "test-cron-secret-0123456789abcdefghij"; // gitleaks:allow (test-only value)
process.env.CRON_SECRET = CRON_SECRET;

afterAll(async () => {
  await closeDb();
});

describe("/api/internal/jobs (Vercel Cron / external schedulers)", () => {
  it("rejects requests without the cron secret", async () => {
    expect((await call(jobsRoute.GET, {})).status).toBe(401);
    const wrong = await call(jobsRoute.GET, { headers: { authorization: "Bearer nope" } });
    expect(wrong.status).toBe(401);
  });

  it("runs every job on GET, as Vercel Cron sends it", async () => {
    const res = await call(jobsRoute.GET, {
      path: "/api/internal/jobs",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.status).toBe(200);
    expect(Object.keys(res.json.results).sort()).toEqual([
      "deliver-webhooks",
      "expire-secrets",
      "purge-housekeeping",
      "purge-metadata",
    ]);
    for (const r of Object.values(res.json.results)) expect(r).toMatchObject({ ok: true });
  });

  it("runs a single named job on POST and rejects unknown jobs", async () => {
    const one = await call(jobsRoute.POST, {
      method: "POST",
      path: "/api/internal/jobs?job=expire-secrets",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(Object.keys(one.json.results)).toEqual(["expire-secrets"]);
    const unknown = await call(jobsRoute.POST, {
      method: "POST",
      path: "/api/internal/jobs?job=drop-tables",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(unknown.status).toBe(404);
  });
});
