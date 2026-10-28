import { z } from "zod";
import { LABEL_MAX_LENGTH, MIN_EXPIRY_SECONDS } from "@/config/plans";

const b64u = (len?: number) => {
  const base = z.string().regex(/^[A-Za-z0-9_-]+$/, "Must be base64url");
  return len ? base.length(len) : base;
};

export const kdfSchema = z.object({
  alg: z.literal("argon2id"),
  salt: b64u(22),
  t: z.number().int(),
  m: z.number().int(),
  p: z.number().int(),
});

export const envelopeSchema = z.object({
  v: z.literal(1),
  iv: b64u(16),
  ct: b64u().min(22).max(1_500_000),
});

export const createSecretSchema = z.object({
  envelope: envelopeSchema,
  kdf: kdfSchema.nullable().default(null),
  /** base64url SHA-256 of the auth proof (43 chars). */
  verifier: b64u(43),
  expiresIn: z.number().int().min(MIN_EXPIRY_SECONDS),
  maxViews: z.number().int().min(1).max(100).default(1),
  maxFailedAttempts: z.number().int().min(3).max(20).optional(),
  label: z
    .string()
    .trim()
    .max(LABEL_MAX_LENGTH)
    .refine(
      (v) => ![...v].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f),
      "Labels cannot contain control characters",
    )
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type CreateSecretInput = z.input<typeof createSecretSchema>;

export const redeemSecretSchema = z.object({
  /** base64url 32-byte HKDF output proving possession of the link key (and passphrase). */
  proof: b64u(43),
});

export const secretIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
