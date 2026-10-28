/**
 * Byte/string encoding helpers shared by browser and server code.
 * Base64url is used everywhere a byte string crosses a boundary (URL fragment, JSON).
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export function utf8Encode(value: string): Uint8Array {
  return textEncoder.encode(value);
}

export function utf8Decode(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const BASE64URL_RE = /^[A-Za-z0-9_-]*$/;

export function fromBase64Url(value: string): Uint8Array {
  if (!BASE64URL_RE.test(value) || value.length % 4 === 1) {
    throw new TypeError("Invalid base64url string");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** WebCrypto's BufferSource typing rejects some Uint8Array<ArrayBufferLike> values; copy into a plain ArrayBuffer. */
export function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}
