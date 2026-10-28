import { Writable } from "node:stream";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { PLANS } from "@/config/plans";
import { deriveKeys, openEnvelope, sealSecret, unsealSecret } from "@/lib/crypto/envelope";
import {
  openAtRest,
  receiptTokenFor,
  safeEqual,
  sealAtRest,
  verifyReceiptToken,
} from "@/server/crypto";
import { createLogger, safeUrlPath } from "@/server/log";
import {
  deriveKeys as cliDerive,
  open as cliOpen,
  seal as cliSeal,
  parseDuration,
} from "../../cli/vaultdrop.mjs";

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  process.env.LOG_LEVEL = "info";
  return { logger: createLogger(stream as never), lines };
}

describe("log redaction", () => {
  it("censors sensitive keys at any depth", () => {
    const { logger, lines } = captureLogs();
    logger.info(
      {
        passphrase: "hunter2",
        authProof: "PROOF",
        envelope: { ct: "CIPHERTEXT" },
        headers: { authorization: "Bearer vd_live_SECRET", cookie: "vaultdrop.session_token=abc" },
        nested: { linkKey: "LINKKEY", receiptToken: "RECEIPT" },
        ok: "visible",
      },
      "test",
    );
    const out = lines.join("");
    for (const s of [
      "hunter2",
      "PROOF",
      "CIPHERTEXT",
      "vd_live_SECRET",
      "session_token=abc",
      "LINKKEY",
      "RECEIPT",
    ])
      expect(out).not.toContain(s);
    expect(out).toContain("visible");
  });

  it("strips fragments, queries and secret ids from logged URLs", () => {
    expect(safeUrlPath("https://x.test/s/AbCdEfGhIjKlMnOpQrStUv#key")).toBe("/s/:id");
    expect(safeUrlPath("https://x.test/receipt/AbCdEfGhIjKlMnOpQrStUv#token")).toBe("/receipt/:id");
    expect(safeUrlPath("https://x.test/api/v1/secrets/AbCdEfGhIjKlMnOpQrStUv/redeem?x=1")).toBe(
      "/api/v1/secrets/:id/redeem",
    );
  });
});

describe("server-side crypto helpers", () => {
  it("derives receipt tokens deterministically and verifies in constant time", () => {
    const t = receiptTokenFor("AbCdEfGhIjKlMnOpQrStUv");
    expect(verifyReceiptToken("AbCdEfGhIjKlMnOpQrStUv", t)).toBe(true);
    expect(verifyReceiptToken("ZbCdEfGhIjKlMnOpQrStUv", t)).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("encrypts values at rest with authentication", () => {
    const sealed = sealAtRest("whsec_value");
    expect(openAtRest(sealed)).toBe("whsec_value");
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(() => openAtRest(tampered)).toThrow();
  });
});

describe("plans", () => {
  it("keeps anonymous limits no larger than free", () => {
    expect(PLANS.anonymous.limits.maxCiphertextBytes).toBeLessThanOrEqual(
      PLANS.free.limits.maxCiphertextBytes,
    );
    expect(PLANS.anonymous.limits.apiAccess).toBe(false);
    expect(PLANS.pro.limits.apiAccess).toBe(true);
  });
});

describe("Stripe webhook signature verification", () => {
  it("accepts correctly signed payloads and rejects forged ones", () => {
    const stripe = new Stripe("sk_test_dummy");
    const payload = JSON.stringify({
      id: "evt_test",
      object: "event",
      type: "customer.subscription.updated",
      data: { object: {} },
    });
    const secret = "whsec_test_secret";
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, header, secret).id).toBe("evt_test");
    expect(() => stripe.webhooks.constructEvent(payload, header, "whsec_wrong")).toThrow();
    expect(() =>
      stripe.webhooks.constructEvent(payload.replace("updated", "deleted"), header, secret),
    ).toThrow();
  });
});

describe("CLI interoperability", () => {
  it("CLI-sealed secrets open with the web library", async () => {
    const sealed = await cliSeal("from the cli 🔑", "cli-pass");
    expect(await unsealSecret(sealed.envelope, sealed.linkKey, sealed.kdf, "cli-pass")).toBe(
      "from the cli 🔑",
    );
    const keys = await deriveKeys(sealed.linkKey, sealed.kdf, "cli-pass");
    const digest = Buffer.from(
      await crypto.subtle.digest("SHA-256", Buffer.from(keys.authProof, "base64url")),
    ).toString("base64url");
    expect(digest).toBe(sealed.verifier);
  });

  it("web-sealed secrets open with the CLI", async () => {
    const sealed = await sealSecret("from the browser", { passphrase: "web-pass" });
    const { encKey } = await cliDerive(sealed.linkKey, sealed.kdf, "web-pass");
    expect(await cliOpen(sealed.envelope, encKey)).toBe("from the browser");
    const { encKey: libKey } = await deriveKeys(sealed.linkKey, sealed.kdf, "web-pass");
    expect(await openEnvelope(sealed.envelope, libKey)).toBe("from the browser");
  });

  it("parses durations", () => {
    expect(parseDuration("15m")).toBe(900);
    expect(parseDuration("1h")).toBe(3600);
    expect(parseDuration("7d")).toBe(604800);
    expect(() => parseDuration("soon")).toThrow();
  });
});
