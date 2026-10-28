import { PLANS, type Plan } from "@/config/plans";
import { deriveKeys, type SealOptions, sealSecret } from "@/lib/crypto/envelope";
import { createSecret, type SecretOwner } from "@/server/secrets/service";

export const anonymousOwner: SecretOwner = {
  userId: null,
  organizationId: null,
  apiKeyId: null,
  environment: "live",
};

export async function makeSecret(
  plaintext = "s3cret-value",
  opts: SealOptions & {
    expiresIn?: number;
    maxViews?: number;
    plan?: Plan;
    owner?: SecretOwner;
    label?: string;
    maxFailedAttempts?: number;
    now?: Date;
  } = {},
) {
  const sealed = await sealSecret(plaintext, opts);
  const created = await createSecret(
    {
      envelope: sealed.envelope,
      kdf: sealed.kdf,
      verifier: sealed.verifier,
      expiresIn: opts.expiresIn ?? 3600,
      maxViews: opts.maxViews ?? 1,
      label: opts.label,
      maxFailedAttempts: opts.maxFailedAttempts,
    },
    {
      owner: opts.owner ?? anonymousOwner,
      plan: opts.plan ?? PLANS.enterprise,
      clock: opts.now ? () => opts.now! : undefined,
    },
  );
  const proof = (await deriveKeys(sealed.linkKey, sealed.kdf, opts.passphrase)).authProof;
  return { ...created, sealed, proof };
}
