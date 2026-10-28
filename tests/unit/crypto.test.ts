import { createDecipheriv, createHash, hkdfSync } from "node:crypto";
import { argon2id } from "@noble/hashes/argon2.js";
import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "@/lib/crypto/encoding";
import {
  ciphertextLengthFor,
  DecryptionError,
  deriveKeys,
  openEnvelope,
  PAD_BLOCK_BYTES,
  padPlaintext,
  parseShareLink,
  sealSecret,
  unpadPlaintext,
  unsealSecret,
  validateKdfParams,
  verifierFromProof,
} from "@/lib/crypto/envelope";
import { generatePassphrase, passphraseEntropyBits } from "@/lib/crypto/passphrase";

const SAMPLE = "postgres://admin:S3cr3t!@db.internal:5432/prod — ünïcødé 🔐";

describe("envelope encryption", () => {
  it("round-trips without a passphrase", async () => {
    const sealed = await sealSecret(SAMPLE);
    expect(sealed.kdf).toBeNull();
    expect(fromBase64Url(sealed.linkKey)).toHaveLength(32);
    expect(await unsealSecret(sealed.envelope, sealed.linkKey, null)).toBe(SAMPLE);
  });

  it("round-trips with a passphrase", async () => {
    const sealed = await sealSecret(SAMPLE, { passphrase: "correct horse" });
    expect(sealed.kdf?.alg).toBe("argon2id");
    expect(await unsealSecret(sealed.envelope, sealed.linkKey, sealed.kdf, "correct horse")).toBe(
      SAMPLE,
    );
  });

  it("never includes plaintext, link key or passphrase in what the server receives", async () => {
    const sealed = await sealSecret(SAMPLE, { passphrase: "hunter2-passphrase" });
    const serverView = JSON.stringify({
      envelope: sealed.envelope,
      kdf: sealed.kdf,
      verifier: sealed.verifier,
    });
    expect(serverView).not.toContain("postgres://");
    expect(serverView).not.toContain(sealed.linkKey);
    expect(serverView).not.toContain("hunter2");
  });

  it("uses a fresh key and IV for every secret", async () => {
    const a = await sealSecret("same");
    const b = await sealSecret("same");
    expect(a.linkKey).not.toBe(b.linkKey);
    expect(a.envelope.iv).not.toBe(b.envelope.iv);
    expect(a.envelope.ct).not.toBe(b.envelope.ct);
  });

  it("rejects a wrong passphrase with a different auth proof and failed decryption", async () => {
    const sealed = await sealSecret(SAMPLE, { passphrase: "right" });
    const wrong = await deriveKeys(sealed.linkKey, sealed.kdf, "wrong");
    expect(await verifierFromProof(wrong.authProof)).not.toBe(sealed.verifier);
    await expect(openEnvelope(sealed.envelope, wrong.encKey)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("requires the passphrase when the secret has KDF parameters", async () => {
    const sealed = await sealSecret(SAMPLE, { passphrase: "right" });
    await expect(deriveKeys(sealed.linkKey, sealed.kdf)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("produces a verifier that matches the correct proof only", async () => {
    const sealed = await sealSecret(SAMPLE);
    const keys = await deriveKeys(sealed.linkKey, null);
    expect(await verifierFromProof(keys.authProof)).toBe(sealed.verifier);
    const other = await sealSecret(SAMPLE);
    const otherKeys = await deriveKeys(other.linkKey, null);
    expect(await verifierFromProof(otherKeys.authProof)).not.toBe(sealed.verifier);
  });

  it("detects ciphertext tampering (GCM tag verification)", async () => {
    const sealed = await sealSecret(SAMPLE);
    const ct = fromBase64Url(sealed.envelope.ct);
    ct[5] = ct[5]! ^ 0x01;
    await expect(
      unsealSecret({ ...sealed.envelope, ct: toBase64Url(ct) }, sealed.linkKey, null),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it("detects tag and IV tampering", async () => {
    const sealed = await sealSecret(SAMPLE);
    const ct = fromBase64Url(sealed.envelope.ct);
    ct[ct.length - 1] = ct[ct.length - 1]! ^ 0x80;
    await expect(
      unsealSecret({ ...sealed.envelope, ct: toBase64Url(ct) }, sealed.linkKey, null),
    ).rejects.toBeInstanceOf(DecryptionError);
    const iv = fromBase64Url(sealed.envelope.iv);
    iv[0] = iv[0]! ^ 0x01;
    await expect(
      unsealSecret({ ...sealed.envelope, iv: toBase64Url(iv) }, sealed.linkKey, null),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it("rejects a wrong link key", async () => {
    const sealed = await sealSecret(SAMPLE);
    const other = await sealSecret("x");
    await expect(unsealSecret(sealed.envelope, other.linkKey, null)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("rejects malformed link keys and envelope versions", async () => {
    const sealed = await sealSecret(SAMPLE);
    await expect(unsealSecret(sealed.envelope, "short", null)).rejects.toBeInstanceOf(
      DecryptionError,
    );
    await expect(
      unsealSecret({ ...sealed.envelope, v: 2 as 1 }, sealed.linkKey, null),
    ).rejects.toThrow(/version/);
  });

  it("normalises passphrases (NFKC) so composed and decomposed forms match", async () => {
    const sealed = await sealSecret("x", { passphrase: "café" });
    expect(await unsealSecret(sealed.envelope, sealed.linkKey, sealed.kdf, "café")).toBe("x");
  });
});

describe("padding", () => {
  it("hides exact length inside 256-byte buckets", () => {
    expect(padPlaintext("")).toHaveLength(PAD_BLOCK_BYTES);
    expect(padPlaintext("a".repeat(252))).toHaveLength(256);
    expect(padPlaintext("a".repeat(253))).toHaveLength(512);
    expect(unpadPlaintext(padPlaintext("hello"))).toBe("hello");
    expect(ciphertextLengthFor(5)).toBe(256 + 16);
  });

  it("rejects corrupted length prefixes", () => {
    const padded = padPlaintext("hello");
    new DataView(padded.buffer).setUint32(0, 10_000, false);
    expect(() => unpadPlaintext(padded)).toThrow(DecryptionError);
  });
});

describe("KDF parameter validation", () => {
  const salt = toBase64Url(new Uint8Array(16));
  it("accepts defaults and rejects weak or abusive parameters", () => {
    expect(validateKdfParams({ alg: "argon2id", salt, t: 2, m: 19456, p: 1 })).toBe(true);
    expect(validateKdfParams({ alg: "argon2id", salt, t: 1, m: 19456, p: 1 })).toBe(false);
    expect(validateKdfParams({ alg: "argon2id", salt, t: 2, m: 1024, p: 1 })).toBe(false);
    expect(validateKdfParams({ alg: "argon2id", salt, t: 2, m: 10_000_000, p: 1 })).toBe(false);
    expect(validateKdfParams({ alg: "argon2id", salt: "AAAA", t: 2, m: 19456, p: 1 })).toBe(false);
  });
});

describe("interoperability with an independent implementation (node:crypto)", () => {
  it("decrypts a browser-format envelope using node's HKDF + AES-256-GCM", async () => {
    const sealed = await sealSecret(SAMPLE, { passphrase: "interop" });
    const kdf = sealed.kdf!;
    const pw = argon2id(new TextEncoder().encode("interop"), fromBase64Url(kdf.salt), {
      t: kdf.t,
      m: kdf.m,
      p: kdf.p,
      dkLen: 32,
    });
    const ikm = Buffer.concat([Buffer.from(fromBase64Url(sealed.linkKey)), Buffer.from(pw)]);
    const salt = Buffer.from("vaultdrop/v1/hkdf-salt");
    const encKey = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("vaultdrop/v1/enc"), 32));
    const authProof = Buffer.from(
      hkdfSync("sha256", ikm, salt, Buffer.from("vaultdrop/v1/auth"), 32),
    );

    expect(toBase64Url(createHash("sha256").update(authProof).digest())).toBe(sealed.verifier);

    const ct = Buffer.from(fromBase64Url(sealed.envelope.ct));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encKey,
      Buffer.from(fromBase64Url(sealed.envelope.iv)),
    );
    decipher.setAAD(Buffer.from("vaultdrop/v1"));
    decipher.setAuthTag(ct.subarray(ct.length - 16));
    const padded = Buffer.concat([
      decipher.update(ct.subarray(0, ct.length - 16)),
      decipher.final(),
    ]);
    expect(unpadPlaintext(new Uint8Array(padded))).toBe(SAMPLE);
  });
});

describe("share links", () => {
  it("parses full URLs and bare id#key forms", () => {
    const id = "A".repeat(22);
    const key = "b".repeat(43);
    expect(parseShareLink(`https://vaultdrop.example/s/${id}#${key}`)).toEqual({
      id,
      linkKey: key,
    });
    expect(parseShareLink(`${id}#${key}`)).toEqual({ id, linkKey: key });
    expect(parseShareLink("https://vaultdrop.example/s/short#key")).toBeNull();
  });
});

describe("passphrase generator", () => {
  it("generates high-entropy, unambiguous passphrases", () => {
    const set = new Set(Array.from({ length: 200 }, () => generatePassphrase()));
    expect(set.size).toBe(200);
    for (const p of set)
      expect(p).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{5}(-[a-km-zA-HJ-NP-Z2-9]{5}){3}$/);
    expect(passphraseEntropyBits()).toBeGreaterThanOrEqual(110);
  });
});
