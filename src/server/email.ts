import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { env, isTest } from "@/server/env";
import { errorInfo, logger } from "@/server/log";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

type Transport = {
  sendMail: (m: { from: string; to: string; subject: string; text: string }) => Promise<unknown>;
};
let transport: Transport | null = null;

async function getTransport(): Promise<Transport | null> {
  const { SMTP_URL, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = env();
  // Test runs never send real email, whatever configuration happens to be loaded.
  if (isTest() || (!SMTP_URL && !SMTP_HOST)) return null;
  if (!transport) {
    const nodemailer = await import("nodemailer");
    transport = SMTP_URL
      ? nodemailer.createTransport(SMTP_URL)
      : nodemailer.createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_SECURE,
          // On 587 refuse to send unless the server upgrades to TLS (no plaintext fallback).
          requireTLS: !SMTP_SECURE,
          auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        });
  }
  return transport;
}

/**
 * Sends transactional email (verification, password reset, invitations). Never used for secret
 * content. Without SMTP configured, development writes messages to .data/outbox.log so links can be
 * followed locally; production refuses to silently drop mail.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const t = await getTransport();
  if (t) {
    try {
      await t.sendMail({ from: env().EMAIL_FROM, ...message });
    } catch (error) {
      logger.error({ err: errorInfo(error), subject: message.subject }, "email delivery failed");
      throw error;
    }
    return;
  }
  // Explicit file outbox (E2E tests, local debugging). Defaults on in development only.
  const outbox =
    process.env.EMAIL_OUTBOX_FILE ??
    (env().NODE_ENV !== "production" || isTest() ? ".data/outbox.log" : null);
  if (!outbox) {
    logger.error(
      { subject: message.subject },
      "email not sent: SMTP_URL is not configured in production",
    );
    throw new Error("SMTP_URL is not configured; cannot send email in production.");
  }
  const file = path.resolve(outbox);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(
    file,
    `${JSON.stringify({ at: new Date().toISOString(), ...message })}\n`,
    "utf8",
  );
  logger.info({ subject: message.subject }, "email written to file outbox (no SMTP configured)");
}
