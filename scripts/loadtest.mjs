/**
 * Load & correctness test against a running VaultDrop server (uses the CLI's crypto).
 *
 *   node scripts/loadtest.mjs --url http://localhost:3100 --secrets 200 --concurrency 20 --racers 10
 *
 * The server must run with TRUST_PROXY=true so each simulated client can present its own IP.
 * Phases: creation throughput, status reads, concurrent redemption races (asserts exactly one
 * success per secret), and anonymous rate-limit enforcement.
 */
import { deriveKeys, seal } from "../cli/vaultdrop.mjs";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const BASE = arg("url", "http://localhost:3100").replace(/\/$/, "");
const SECRETS = Number(arg("secrets", 200));
const CONCURRENCY = Number(arg("concurrency", 20));
const RACERS = Number(arg("racers", 10));

let ipSeq = 0;
const ip = () => `100.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`;

async function timed(fn) {
  const t = performance.now();
  const res = await fn();
  return { ms: performance.now() - t, res };
}

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]?.toFixed(1);
  return { n: s.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s.at(-1)?.toFixed(1) };
}

async function pool(items, n, worker) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx], idx);
      }
    }),
  );
  return out;
}

const post = (path, body, headers = {}) =>
  fetch(`${BASE}/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip(), ...headers },
    body: JSON.stringify(body),
  });

async function main() {
  console.log(
    `VaultDrop load test → ${BASE}  secrets=${SECRETS} concurrency=${CONCURRENCY} racers=${RACERS}`,
  );

  // Phase 1: creation (client-side encryption excluded from latency).
  const sealed = await Promise.all(
    Array.from({ length: SECRETS }, (_, i) => seal(`load-test-secret-${i}-${"x".repeat(i % 200)}`)),
  );
  const created = await pool(sealed, CONCURRENCY, async (s) => {
    const { ms, res } = await timed(() =>
      post("/secrets", { envelope: s.envelope, kdf: s.kdf, verifier: s.verifier, expiresIn: 600 }),
    );
    const body = await res.json();
    return { ms, status: res.status, id: body.id, linkKey: s.linkKey };
  });
  const createdOk = created.filter((c) => c.status === 201);
  console.log("create", {
    ok: createdOk.length,
    failed: created.length - createdOk.length,
    ...stats(created.map((c) => c.ms)),
  });

  // Phase 2: status reads.
  const statuses = await pool(createdOk, CONCURRENCY, async (c) => {
    const { ms, res } = await timed(() =>
      fetch(`${BASE}/api/v1/secrets/${c.id}/status`, { headers: { "X-Forwarded-For": ip() } }),
    );
    await res.body?.cancel();
    return { ms, status: res.status };
  });
  console.log("status", {
    ok: statuses.filter((s) => s.status === 200).length,
    ...stats(statuses.map((s) => s.ms)),
  });

  // Phase 3: redemption races — RACERS concurrent requests per secret, exactly one may succeed.
  let duplicates = 0;
  let zero = 0;
  const redeemMs = [];
  await pool(createdOk, Math.max(1, Math.floor(CONCURRENCY / 2)), async (c) => {
    const { authProof } = await deriveKeys(c.linkKey, null);
    const results = await Promise.all(
      Array.from({ length: RACERS }, async () => {
        const { ms, res } = await timed(() =>
          post(`/secrets/${c.id}/redeem`, { proof: authProof }),
        );
        await res.body?.cancel();
        redeemMs.push(ms);
        return res.status;
      }),
    );
    const wins = results.filter((s) => s === 200).length;
    if (wins > 1) duplicates++;
    if (wins === 0) zero++;
  });
  console.log("redeem", {
    secrets: createdOk.length,
    duplicateSuccesses: duplicates,
    noSuccess: zero,
    ...stats(redeemMs),
  });

  // Phase 4: rate limiting — one client bursts anonymous creations.
  const burstIp = "100.255.255.254";
  const s = sealed[0];
  const codes = [];
  for (let i = 0; i < 25; i++) {
    const res = await post(
      "/secrets",
      { envelope: s.envelope, kdf: null, verifier: s.verifier, expiresIn: 600 },
      { "X-Forwarded-For": burstIp },
    );
    await res.body?.cancel();
    codes.push(res.status);
  }
  const first429 = codes.indexOf(429);
  console.log("rate-limit", {
    accepted: codes.filter((c) => c === 201).length,
    firstRejectedAt: first429 + 1,
  });

  const ok = duplicates === 0 && zero === 0 && first429 === 20;
  console.log(ok ? "\nPASS: no duplicate redemptions; rate limit enforced at 20." : "\nFAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
