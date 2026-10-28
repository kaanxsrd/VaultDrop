import "server-only";
import pino from "pino";

/**
 * Structured logger with defence-in-depth redaction. Callers should never pass sensitive values,
 * but if one slips into a log object under a known key it is censored before serialization.
 */
export const REDACT_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "passphrase",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "apiKey",
  "authProof",
  "verifier",
  "linkKey",
  "receiptToken",
  "secret",
  "plaintext",
  "ciphertext",
  "envelope",
  "ct",
  "iv",
  "kdf",
  "backupCodes",
] as const;

const paths = REDACT_KEYS.flatMap((k) => [
  k,
  `*.${k}`,
  `*.*.${k}`,
  `headers["${k}"]`,
  `req.headers["${k}"]`,
]);

export function createLogger(destination?: pino.DestinationStream) {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: "vaultdrop" },
      redact: { paths, censor: "[redacted]" },
      formatters: { level: (label) => ({ level: label }) },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}

export const logger = createLogger();

/** Strips query strings and fragments: share links and receipt tokens must never be logged. */
export function safeUrlPath(url: string): string {
  try {
    const u = new URL(url, "http://local");
    // Secret ids in paths are replaced so logs cannot be correlated with specific secrets.
    return u.pathname
      .replace(/\/(s|receipt)\/[A-Za-z0-9_-]+/g, "/$1/:id")
      .replace(/\/secrets\/[A-Za-z0-9_-]{22}/g, "/secrets/:id");
  } catch {
    return "[unparseable-url]";
  }
}

/** Turns an unknown error into a log-safe shape (name + message only, no request bodies). */
export function errorInfo(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message.slice(0, 500) };
  return { name: "UnknownError", message: "Non-error value thrown" };
}
