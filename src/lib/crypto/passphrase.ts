/**
 * Strong, readable passphrase generation using rejection sampling (no modulo bias).
 * Alphabet excludes visually ambiguous characters (0/O, 1/l/I).
 */

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function uniformIndex(max: number): number {
  const limit = Math.floor(256 / max) * max;
  const byte = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(byte);
    if (byte[0]! < limit) return byte[0]! % max;
  }
}

/** Default: 4 groups of 5 characters ≈ 116 bits of entropy. */
export function generatePassphrase(groups = 4, groupLength = 5): string {
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) {
    let part = "";
    for (let i = 0; i < groupLength; i++) part += ALPHABET[uniformIndex(ALPHABET.length)];
    parts.push(part);
  }
  return parts.join("-");
}

export function passphraseEntropyBits(groups = 4, groupLength = 5): number {
  return Math.floor(groups * groupLength * Math.log2(ALPHABET.length));
}
