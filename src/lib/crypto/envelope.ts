/**
 * VaultDrop envelope encryption, format version 1.
 *
 * Everything in this file runs in the sender's and recipient's browsers. The server only ever
 * sees the output of `sealSecret` (ciphertext, IV, KDF parameters, verifier) and, at redemption
 * time, the `authProof`. See docs/encryption.md for the full design and its security analysis.
 *
 *   linkKey   = 32 random bytes                   (travels only in the URL fragment)
 *   pwKey     = Argon2id(passphrase, kdfSalt)     (only when a passphrase is set)
 *   ikm       = linkKey || pwKey                  (or linkKey alone)
 *   encKey    = HKDF-SHA256(ikm, salt, "vaultdrop/v1/enc")   → AES-256-GCM key
 *   authProof = HKDF-SHA256(ikm, salt, "vaultdrop/v1/auth")  → 32 bytes, sent at redemption
 *   verifier  = SHA-256(authProof)                            → stored by the server
 */

import { argon2idAsync } from "@noble/hashes/argon2.js";
import {
  buf,
  concatBytes,
  fromBase64Url,
  randomBytes,
  toBase64Url,
  utf8Decode,
  utf8Encode,
} from "./encoding";

export const ENVELOPE_VERSION = 1 as const;
export const LINK_KEY_BYTES = 32;
export const IV_BYTES = 12;
export const KDF_SALT_BYTES = 16;
export const PAD_BLOCK_BYTES = 256;
const LENGTH_PREFIX_BYTES = 4;
const GCM_TAG_BYTES = 16;

/** OWASP 2024 minimum for Argon2id: 19 MiB, 2 iterations, 1 lane. */
export const DEFAULT_ARGON2_PARAMS = { t: 2, m: 19_456, p: 1 } as const;
/** Bounds the server accepts, so a malicious creator cannot make recipients burn CPU for minutes. */
export const ARGON2_LIMITS = { tMin: 2, tMax: 8, mMin: 19_456, mMax: 131_072, pMin: 1, pMax: 4 };

const HKDF_SALT = utf8Encode("vaultdrop/v1/hkdf-salt");
const INFO_ENC = utf8Encode("vaultdrop/v1/enc");
const INFO_AUTH = utf8Encode("vaultdrop/v1/auth");
const AAD = utf8Encode("vaultdrop/v1");

export interface KdfParams {
  alg: "argon2id";
  /** base64url, 16 bytes */
  salt: string;
  t: number;
  m: number;
  p: number;
}

/** What the server stores and returns at redemption. Contains no key material. */
export interface Envelope {
  v: typeof ENVELOPE_VERSION;
  /** base64url, 12 bytes */
  iv: string;
  /** base64url AES-GCM ciphertext including the 16-byte tag */
  ct: string;
}

export interface SealedSecret {
  envelope: Envelope;
  kdf: KdfParams | null;
  /** base64url SHA-256(authProof); stored server-side to check redemption requests. */
  verifier: string;
  /** base64url link key: goes in the URL fragment, never to the server. */
  linkKey: string;
}

export interface DerivedKeys {
  encKey: CryptoKey;
  /** base64url; proves possession of the link (and passphrase) without revealing the key. */
  authProof: string;
}

export class DecryptionError extends Error {
  constructor(message = "The secret could not be decrypted.") {
    super(message);
    this.name = "DecryptionError";
  }
}

const subtle = () => globalThis.crypto.subtle;

/** Unicode-normalise so the same passphrase typed on different platforms derives the same key. */
export function normalizePassphrase(passphrase: string): string {
  return passphrase.normalize("NFKC");
}

/** Pads plaintext to a multiple of PAD_BLOCK_BYTES so the server learns only a coarse size bucket. */
export function padPlaintext(plaintext: string): Uint8Array {
  const body = utf8Encode(plaintext);
  const total = Math.ceil((body.length + LENGTH_PREFIX_BYTES) / PAD_BLOCK_BYTES) * PAD_BLOCK_BYTES;
  const out = new Uint8Array(Math.max(total, PAD_BLOCK_BYTES));
  new DataView(out.buffer).setUint32(0, body.length, false);
  out.set(body, LENGTH_PREFIX_BYTES);
  return out;
}

export function unpadPlaintext(padded: Uint8Array): string {
  if (padded.length < LENGTH_PREFIX_BYTES || padded.length % PAD_BLOCK_BYTES !== 0) {
    throw new DecryptionError("Malformed plaintext padding.");
  }
  const length = new DataView(padded.buffer, padded.byteOffset).getUint32(0, false);
  if (length > padded.length - LENGTH_PREFIX_BYTES) {
    throw new DecryptionError("Malformed plaintext padding.");
  }
  return utf8Decode(padded.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + length));
}

/** Ciphertext length (bytes) produced for a plaintext of the given UTF-8 byte length. */
export function ciphertextLengthFor(plaintextBytes: number): number {
  const padded = Math.max(
    Math.ceil((plaintextBytes + LENGTH_PREFIX_BYTES) / PAD_BLOCK_BYTES) * PAD_BLOCK_BYTES,
    PAD_BLOCK_BYTES,
  );
  return padded + GCM_TAG_BYTES;
}

export function validateKdfParams(kdf: KdfParams): boolean {
  const L = ARGON2_LIMITS;
  let saltOk = false;
  try {
    saltOk = fromBase64Url(kdf.salt).length === KDF_SALT_BYTES;
  } catch {
    saltOk = false;
  }
  return (
    kdf.alg === "argon2id" &&
    saltOk &&
    Number.isInteger(kdf.t) &&
    kdf.t >= L.tMin &&
    kdf.t <= L.tMax &&
    Number.isInteger(kdf.m) &&
    kdf.m >= L.mMin &&
    kdf.m <= L.mMax &&
    Number.isInteger(kdf.p) &&
    kdf.p >= L.pMin &&
    kdf.p <= L.pMax
  );
}

async function passphraseKey(passphrase: string, kdf: KdfParams): Promise<Uint8Array> {
  if (!validateKdfParams(kdf)) throw new DecryptionError("Unsupported key-derivation parameters.");
  return argon2idAsync(utf8Encode(normalizePassphrase(passphrase)), fromBase64Url(kdf.salt), {
    t: kdf.t,
    m: kdf.m,
    p: kdf.p,
    dkLen: 32,
    asyncTick: 25,
  });
}

/**
 * Derives the encryption key and the redemption proof from the link key (and passphrase).
 * Throws if a passphrase is required but missing.
 */
export async function deriveKeys(
  linkKey: string,
  kdf: KdfParams | null,
  passphrase?: string,
): Promise<DerivedKeys> {
  let linkBytes: Uint8Array;
  try {
    linkBytes = fromBase64Url(linkKey);
  } catch {
    throw new DecryptionError("The link key is malformed.");
  }
  if (linkBytes.length !== LINK_KEY_BYTES) throw new DecryptionError("The link key is malformed.");

  let ikm = linkBytes;
  if (kdf) {
    if (!passphrase) throw new DecryptionError("A passphrase is required.");
    ikm = concatBytes(linkBytes, await passphraseKey(passphrase, kdf));
  }

  const base = await subtle().importKey("raw", buf(ikm), "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ]);
  const encKey = await subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: buf(HKDF_SALT), info: buf(INFO_ENC) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const authBits = await subtle().deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: buf(HKDF_SALT), info: buf(INFO_AUTH) },
    base,
    256,
  );
  return { encKey, authProof: toBase64Url(new Uint8Array(authBits)) };
}

/** SHA-256 of the auth proof. Used by the client at creation and by the server at redemption. */
export async function verifierFromProof(authProof: string): Promise<string> {
  const digest = await subtle().digest("SHA-256", buf(fromBase64Url(authProof)));
  return toBase64Url(new Uint8Array(digest));
}

export interface SealOptions {
  passphrase?: string;
  argon2?: { t: number; m: number; p: number };
}

/** Encrypts a plaintext secret with a fresh, independent key. */
export async function sealSecret(
  plaintext: string,
  options: SealOptions = {},
): Promise<SealedSecret> {
  const linkKey = toBase64Url(randomBytes(LINK_KEY_BYTES));
  const passphrase =
    options.passphrase && options.passphrase.length > 0 ? options.passphrase : undefined;
  const kdf: KdfParams | null = passphrase
    ? {
        alg: "argon2id",
        salt: toBase64Url(randomBytes(KDF_SALT_BYTES)),
        ...(options.argon2 ?? DEFAULT_ARGON2_PARAMS),
      }
    : null;

  const { encKey, authProof } = await deriveKeys(linkKey, kdf, passphrase);
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await subtle().encrypt(
    { name: "AES-GCM", iv: buf(iv), additionalData: buf(AAD), tagLength: 128 },
    encKey,
    buf(padPlaintext(plaintext)),
  );

  return {
    envelope: {
      v: ENVELOPE_VERSION,
      iv: toBase64Url(iv),
      ct: toBase64Url(new Uint8Array(ciphertext)),
    },
    kdf,
    verifier: await verifierFromProof(authProof),
    linkKey,
  };
}

/** Decrypts an envelope with an already-derived key. Fails closed on any tampering. */
export async function openEnvelope(envelope: Envelope, encKey: CryptoKey): Promise<string> {
  if (envelope.v !== ENVELOPE_VERSION) throw new DecryptionError("Unsupported envelope version.");
  let iv: Uint8Array;
  let ct: Uint8Array;
  try {
    iv = fromBase64Url(envelope.iv);
    ct = fromBase64Url(envelope.ct);
  } catch {
    throw new DecryptionError("The encrypted payload is malformed.");
  }
  if (iv.length !== IV_BYTES) throw new DecryptionError("The encrypted payload is malformed.");

  let padded: ArrayBuffer;
  try {
    padded = await subtle().decrypt(
      { name: "AES-GCM", iv: buf(iv), additionalData: buf(AAD), tagLength: 128 },
      encKey,
      buf(ct),
    );
  } catch {
    throw new DecryptionError(
      "Authentication failed: the key is wrong or the payload was modified.",
    );
  }
  return unpadPlaintext(new Uint8Array(padded));
}

/** Convenience for tests and the CLI: derive + decrypt in one step. */
export async function unsealSecret(
  envelope: Envelope,
  linkKey: string,
  kdf: KdfParams | null,
  passphrase?: string,
): Promise<string> {
  const { encKey } = await deriveKeys(linkKey, kdf, passphrase);
  return openEnvelope(envelope, encKey);
}

/** Splits a share URL into secret id and link key. Accepts full URLs or `id#key`. */
export function parseShareLink(input: string): { id: string; linkKey: string } | null {
  const match = /(?:\/s\/)?([A-Za-z0-9_-]{22})#([A-Za-z0-9_-]{43})\s*$/.exec(input.trim());
  return match ? { id: match[1]!, linkKey: match[2]! } : null;
}
