/**
 * vaultdrop: create and open VaultDrop secrets from the terminal.
 *
 * Encryption happens locally (AES-256-GCM, HKDF-SHA256, optional Argon2id), exactly as in the web
 * app. The server never receives the plaintext, passphrase or link key. This module is both the
 * CLI implementation (`run`) and a small programmatic API (`seal`, `open`, `deriveKeys`); the
 * executable entry point is ./bin.mjs.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { argon2idAsync } from "@noble/hashes/argon2.js";

export const DEFAULT_SERVER = "https://vaultdrop.vante.app";

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });
const HKDF_SALT = enc.encode("vaultdrop/v1/hkdf-salt");
const AAD = enc.encode("vaultdrop/v1");
const ARGON2 = { t: 2, m: 19456, p: 1 };
/** Same bounds the server enforces; refuse anything else so a hostile server can't exhaust memory. */
const ARGON2_LIMITS = { tMin: 2, tMax: 8, mMin: 19_456, mMax: 131_072, pMin: 1, pMax: 4 };

export const b64u = {
  encode: (bytes) => Buffer.from(bytes).toString("base64url"),
  decode: (s) => new Uint8Array(Buffer.from(s, "base64url")),
};

const random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

function assertKdf(kdf) {
  const L = ARGON2_LIMITS;
  const ok =
    kdf.alg === "argon2id" &&
    Number.isInteger(kdf.t) &&
    kdf.t >= L.tMin &&
    kdf.t <= L.tMax &&
    Number.isInteger(kdf.m) &&
    kdf.m >= L.mMin &&
    kdf.m <= L.mMax &&
    Number.isInteger(kdf.p) &&
    kdf.p >= L.pMin &&
    kdf.p <= L.pMax &&
    b64u.decode(kdf.salt).length === 16;
  if (!ok) throw new Error("Unsupported key-derivation parameters");
}

export async function deriveKeys(linkKey, kdf, passphrase) {
  let ikm = b64u.decode(linkKey);
  if (ikm.length !== 32) throw new Error("Malformed link key");
  if (kdf) {
    assertKdf(kdf);
    if (!passphrase) throw new Error("This secret requires a passphrase");
    const pw = await argon2idAsync(
      enc.encode(passphrase.normalize("NFKC")),
      b64u.decode(kdf.salt),
      { t: kdf.t, m: kdf.m, p: kdf.p, dkLen: 32 },
    );
    ikm = new Uint8Array([...ikm, ...pw]);
  }
  const base = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey", "deriveBits"]);
  const encKey = await subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: enc.encode("vaultdrop/v1/enc") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const auth = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: enc.encode("vaultdrop/v1/auth") },
    base,
    256,
  );
  return { encKey, authProof: b64u.encode(new Uint8Array(auth)) };
}

function pad(text) {
  const body = enc.encode(text);
  const total = Math.max(Math.ceil((body.length + 4) / 256) * 256, 256);
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, body.length, false);
  out.set(body, 4);
  return out;
}

function unpad(bytes) {
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, false);
  if (len > bytes.length - 4) throw new Error("Malformed padding");
  return dec.decode(bytes.subarray(4, 4 + len));
}

export async function seal(plaintext, passphrase) {
  const linkKey = b64u.encode(random(32));
  const kdf = passphrase ? { alg: "argon2id", salt: b64u.encode(random(16)), ...ARGON2 } : null;
  const { encKey, authProof } = await deriveKeys(linkKey, kdf, passphrase);
  const iv = random(12);
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: AAD },
    encKey,
    pad(plaintext),
  );
  const verifier = b64u.encode(
    new Uint8Array(await subtle.digest("SHA-256", b64u.decode(authProof))),
  );
  return {
    envelope: { v: 1, iv: b64u.encode(iv), ct: b64u.encode(new Uint8Array(ct)) },
    kdf,
    verifier,
    linkKey,
  };
}

export async function open(envelope, encKey) {
  const pt = await subtle.decrypt(
    { name: "AES-GCM", iv: b64u.decode(envelope.iv), additionalData: AAD },
    encKey,
    b64u.decode(envelope.ct),
  );
  return unpad(new Uint8Array(pt));
}

export function parseDuration(s) {
  const m = /^(\d+)\s*(m|min|h|d)?$/.exec(String(s).trim());
  if (!m) throw new Error(`Invalid duration "${s}" (use e.g. 15m, 1h, 7d)`);
  const n = Number(m[1]);
  return n * ({ m: 60, min: 60, h: 3600, d: 86400 }[m[2] ?? "m"] ?? 60);
}

export function version() {
  return JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
}

const HELP = `vaultdrop: share secrets that self-destruct after one read.

Usage
  echo "$SECRET" | vaultdrop [options]     create a secret from stdin, print the link
  vaultdrop open <link>                    open a secret and print it to stdout

Options
  -e, --expires <time>   expiry, e.g. 15m, 1h, 7d          (default: 24h)
      --views <n>        times the link can be opened       (default: 1)
  -p, --passphrase       also require a passphrase (prompted, or VAULTDROP_PASSPHRASE)
      --label <text>     private label shown in your dashboard (needs an API key)
      --receipt          also print a private receipt link (to stderr)
      --server <url>     VaultDrop server (default: ${DEFAULT_SERVER})
  -h, --help             show this help
  -v, --version          show the version

Environment
  VAULTDROP_SERVER       server URL (overridden by --server)
  VAULTDROP_API_KEY      API key (vd_live_… / vd_test_…) for higher limits and labels
  VAULTDROP_PASSPHRASE   passphrase for non-interactive use

Everything is encrypted on this machine; the server never sees your secret,
the link key or the passphrase.`;

class UsageError extends Error {}

async function readStdin(stdin) {
  const chunks = [];
  for await (const c of stdin) chunks.push(c);
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
}

async function promptHidden(question) {
  if (process.env.VAULTDROP_PASSPHRASE) return process.env.VAULTDROP_PASSPHRASE;
  if (!process.stdin.isTTY) {
    throw new UsageError(
      "A passphrase is needed but there is no terminal; set VAULTDROP_PASSPHRASE",
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  rl._writeToOutput = (s) => {
    if (s.startsWith(question)) process.stderr.write(question);
  };
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  process.stderr.write("\n");
  return answer;
}

async function request(server, path, init = {}) {
  const headers = {
    Accept: "application/json",
    "User-Agent": `vaultdrop-cli/${version()}`,
    ...(init.body ? { "Content-Type": "application/json" } : {}),
  };
  if (process.env.VAULTDROP_API_KEY)
    headers.Authorization = `Bearer ${process.env.VAULTDROP_API_KEY}`;
  let res;
  try {
    res = await fetch(`${server}/api/v1${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const reason =
      err.name === "TimeoutError"
        ? "timed out"
        : (err.cause?.code ?? err.cause?.errors?.[0]?.code ?? err.cause?.message ?? err.message);
    throw new Error(`Could not reach ${server} (${reason})`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status} from ${server}`);
  return body;
}

/**
 * Runs the CLI. Returns the process exit code: 0 success, 1 failure, 2 usage error.
 * `io` is injectable for tests.
 */
export async function run(
  argv,
  io = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        expires: { type: "string", short: "e" },
        views: { type: "string" },
        passphrase: { type: "boolean", short: "p" },
        label: { type: "string" },
        receipt: { type: "boolean" },
        server: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (err) {
    io.stderr.write(`vaultdrop: ${err.message}\nRun "vaultdrop --help" for usage.\n`);
    return 2;
  }
  const { values: opts, positionals } = parsed;
  if (opts.help) {
    io.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (opts.version) {
    io.stdout.write(`${version()}\n`);
    return 0;
  }

  const server = (opts.server ?? process.env.VAULTDROP_SERVER ?? DEFAULT_SERVER).replace(
    /\/+$/,
    "",
  );
  try {
    if (!/^https?:\/\//.test(server)) throw new UsageError(`Invalid server URL "${server}"`);

    if (positionals[0] === "open") {
      const m = /\/s\/([A-Za-z0-9_-]{22})#([A-Za-z0-9_-]{43})/.exec(positionals[1] ?? "");
      if (!m)
        throw new UsageError("Usage: vaultdrop open <share-link>  (include the part after #)");
      const [, id, linkKey] = m;
      const status = await request(server, `/secrets/${id}/status`);
      if (status.state !== "active") throw new Error(`This secret is ${status.state}`);
      const passphrase = status.requiresPassphrase ? await promptHidden("Passphrase: ") : undefined;
      const { encKey, authProof } = await deriveKeys(linkKey, status.kdf, passphrase);
      const { envelope } = await request(server, `/secrets/${id}/redeem`, {
        method: "POST",
        body: JSON.stringify({ proof: authProof }),
      });
      io.stdout.write(`${await open(envelope, encKey)}\n`);
      return 0;
    }
    if (positionals.length > 0) throw new UsageError(`Unknown command "${positionals[0]}"`);

    if (io.stdin.isTTY) {
      throw new UsageError(
        'Pipe the secret on stdin, e.g.  echo "$TOKEN" | vaultdrop --expires 1h',
      );
    }
    const views = Number(opts.views ?? 1);
    if (!Number.isInteger(views) || views < 1 || views > 100) {
      throw new UsageError("--views must be a whole number between 1 and 100");
    }
    let expiresIn;
    try {
      expiresIn = parseDuration(opts.expires ?? "24h");
    } catch (err) {
      // A malformed flag value is a usage error (exit 2), not a runtime failure.
      throw new UsageError(err.message);
    }
    const plaintext = await readStdin(io.stdin);
    if (!plaintext) throw new UsageError("Nothing to share: stdin was empty");
    const passphrase = opts.passphrase ? await promptHidden("Passphrase: ") : undefined;
    const sealed = await seal(plaintext, passphrase);
    const idem = process.env.VAULTDROP_API_KEY
      ? { "Idempotency-Key": `cli-${b64u.encode(random(12))}` }
      : {};
    const created = await request(server, "/secrets", {
      method: "POST",
      headers: idem,
      body: JSON.stringify({
        envelope: sealed.envelope,
        kdf: sealed.kdf,
        verifier: sealed.verifier,
        expiresIn,
        maxViews: views,
        label: opts.label,
      }),
    });
    io.stdout.write(`${created.shareUrlBase}#${sealed.linkKey}\n`);
    if (opts.receipt)
      io.stderr.write(`receipt: ${created.receiptUrlBase}#${created.receiptToken}\n`);
    return 0;
  } catch (err) {
    io.stderr.write(`vaultdrop: ${err.message}\n`);
    return err instanceof UsageError ? 2 : 1;
  }
}
