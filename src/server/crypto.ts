import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@/server/env";

const b64u = (buf: Buffer) => buf.toString("base64url");

/** 128-bit random identifier (22 base64url chars). */
export function newSecretId(): string {
  return b64u(randomBytes(16));
}

/** Prefixed random identifier for non-secret records, e.g. `ak_…`, `wh_…`. */
export function newId(prefix: string): string {
  return `${prefix}_${b64u(randomBytes(12))}`;
}

export function randomToken(bytes = 32): string {
  return b64u(randomBytes(bytes));
}

export function sha256(value: string | Buffer): string {
  return b64u(createHash("sha256").update(value).digest());
}

/** Constant-time comparison of two base64url/ASCII strings. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function subkey(purpose: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", env().APP_SECRET, "vaultdrop/server", `vaultdrop/${purpose}`, 32),
  );
}

export function hmac(purpose: string, message: string): string {
  return b64u(
    createHmac("sha256", subkey(`hmac/${purpose}`))
      .update(message)
      .digest(),
  );
}

/** Receipt tokens are derived, not stored: HMAC(APP_SECRET, secret id). */
export function receiptTokenFor(secretId: string): string {
  return hmac("receipt", secretId);
}

export function verifyReceiptToken(secretId: string, token: string): boolean {
  return safeEqual(receiptTokenFor(secretId), token);
}

/** Pseudonymous key for rate limiting / abuse tracking. Raw IPs are never stored. */
export function pseudonymize(kind: string, value: string): string {
  return hmac(`pseudo/${kind}`, value).slice(0, 32);
}

/** Server-side at-rest encryption for values the server must later use (webhook signing secrets). */
export function sealAtRest(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subkey("at-rest"), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1.${b64u(iv)}.${b64u(Buffer.concat([ct, cipher.getAuthTag()]))}`;
}

export function openAtRest(sealed: string): string {
  const [version, ivB64, ctB64] = sealed.split(".");
  if (version !== "v1" || !ivB64 || !ctB64) throw new Error("Unsupported at-rest format");
  const data = Buffer.from(ctB64, "base64url");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    subkey("at-rest"),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([
    decipher.update(data.subarray(0, data.length - 16)),
    decipher.final(),
  ]).toString("utf8");
}
