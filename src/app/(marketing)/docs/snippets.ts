// Documentation snippets. Keep lines ≤ ~84 characters so they fit the docs column unscrolled.

export const CURL_FLOW = `# 1. Encrypt locally (the CLI or an SDK does this for you), then create:
curl -sS https://vaultdrop.example/api/v1/secrets \\
  -H "Authorization: Bearer $VAULTDROP_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: deploy-4821" \\
  -d @sealed.json
# → { "id": "Xk2p…", "expiresAt": "…", "receiptToken": "…",
#     "shareUrlBase": "https://vaultdrop.example/s/Xk2p…" }
# Share <shareUrlBase>#<linkKey> — the link key never leaves your machine.

# 2. Check status (does not consume)
curl -sS https://vaultdrop.example/api/v1/secrets/Xk2p…/status

# 3. Destroy before it is read
curl -sS -X POST https://vaultdrop.example/api/v1/secrets/Xk2p…/burn \\
  -H "Authorization: Bearer $VAULTDROP_API_KEY"`;

export const CLI = `# Install (Node 20.19+ or Bun), or run without installing via npx / bunx
npm install -g vaultdrop

export VAULTDROP_API_KEY=vd_live_…   # optional; anonymous limits apply without it
# export VAULTDROP_SERVER=https://…  # only for self-hosted servers

echo "$DB_PASSWORD" | vaultdrop --expires 1h
vaultdrop --passphrase --views 3 --label "staging creds" < creds.txt
vaultdrop open "https://vaultdrop.example/s/Xk2p…#M3f…"`;

export const TYPESCRIPT = `// Bun, Node 20+ or any modern browser. Mirrors cli/vaultdrop.mjs,
// which is covered by VaultDrop's interoperability tests.
import { argon2idAsync } from "@noble/hashes/argon2.js";

const subtle = crypto.subtle;
const te = new TextEncoder();
const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const SALT = te.encode("vaultdrop/v1/hkdf-salt");
const AAD = te.encode("vaultdrop/v1");
const ARGON2 = { t: 2, m: 19456, p: 1 };

async function derive(ikm: Uint8Array) {
  const base = await subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ]);
  const hkdf = (info: string) => ({
    name: "HKDF", hash: "SHA-256", salt: SALT, info: te.encode(info),
  });
  const encKey = await subtle.deriveKey(
    hkdf("vaultdrop/v1/enc"), base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
  const proof = new Uint8Array(
    await subtle.deriveBits(hkdf("vaultdrop/v1/auth"), base, 256),
  );
  return { encKey, proof };
}

function pad(text: string) {
  const body = te.encode(text);
  const size = Math.max(Math.ceil((body.length + 4) / 256) * 256, 256);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, body.length);
  out.set(body, 4);
  return out;
}

export async function createSecret(
  server: string, apiKey: string, text: string, passphrase?: string,
) {
  const linkKey = crypto.getRandomValues(new Uint8Array(32));
  let ikm = linkKey;
  let kdf = null;
  if (passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    kdf = { alg: "argon2id", salt: b64u(salt), ...ARGON2 };
    const pw = await argon2idAsync(
      te.encode(passphrase.normalize("NFKC")), salt, { ...ARGON2, dkLen: 32 },
    );
    ikm = new Uint8Array([...linkKey, ...pw]);
  }

  const { encKey, proof } = await derive(ikm);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: AAD }, encKey, pad(text),
  ));
  const verifier = b64u(new Uint8Array(await subtle.digest("SHA-256", proof)));

  const res = await fetch(\`\${server}/api/v1/secrets\`, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${apiKey}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      envelope: { v: 1, iv: b64u(iv), ct: b64u(ct) },
      kdf,
      verifier,
      expiresIn: 3600,
    }),
  });
  if (!res.ok) throw new Error((await res.json()).error.message);
  const { shareUrlBase } = await res.json();
  return \`\${shareUrlBase}#\${b64u(linkKey)}\`;
}`;

export const PYTHON = `# Reference example (not run by VaultDrop's automated tests).
# pip install cryptography argon2-cffi requests
import base64, hashlib, os, struct, unicodedata
import requests
from argon2.low_level import Type, hash_secret_raw
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

SALT, AAD = b"vaultdrop/v1/hkdf-salt", b"vaultdrop/v1"


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def hkdf(ikm: bytes, info: bytes) -> bytes:
    kdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=SALT, info=info)
    return kdf.derive(ikm)


def pad(text: str) -> bytes:
    body = text.encode()
    size = max(-(-(len(body) + 4) // 256) * 256, 256)
    return struct.pack(">I", len(body)) + body + bytes(size - 4 - len(body))


def create_secret(server: str, api_key: str, text: str,
                  passphrase: str | None = None) -> str:
    link_key, kdf = os.urandom(32), None
    ikm = link_key
    if passphrase:
        salt = os.urandom(16)
        kdf = {"alg": "argon2id", "salt": b64u(salt), "t": 2, "m": 19456, "p": 1}
        ikm += hash_secret_raw(
            unicodedata.normalize("NFKC", passphrase).encode(), salt,
            time_cost=2, memory_cost=19456, parallelism=1,
            hash_len=32, type=Type.ID,
        )

    enc_key = hkdf(ikm, b"vaultdrop/v1/enc")
    proof = hkdf(ikm, b"vaultdrop/v1/auth")
    iv = os.urandom(12)
    ct = AESGCM(enc_key).encrypt(iv, pad(text), AAD)

    res = requests.post(
        f"{server}/api/v1/secrets",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "envelope": {"v": 1, "iv": b64u(iv), "ct": b64u(ct)},
            "kdf": kdf,
            "verifier": b64u(hashlib.sha256(proof).digest()),
            "expiresIn": 3600,
        },
        timeout=10,
    )
    res.raise_for_status()
    return f"{res.json()['shareUrlBase']}#{b64u(link_key)}"`;

export const GO = `// Reference example (not run by VaultDrop's automated tests).
// go get golang.org/x/crypto
package vaultdrop

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"golang.org/x/crypto/hkdf"
)

var b64u = base64.RawURLEncoding

func derive(ikm []byte, info string) []byte {
	salt := []byte("vaultdrop/v1/hkdf-salt")
	out := make([]byte, 32)
	io.ReadFull(hkdf.New(sha256.New, ikm, salt, []byte(info)), out)
	return out
}

func pad(text string) []byte {
	body := []byte(text)
	out := make([]byte, ((len(body)+4+255)/256)*256)
	binary.BigEndian.PutUint32(out, uint32(len(body)))
	copy(out[4:], body)
	return out
}

// Passphrase variant: ikm = linkKey || argon2.IDKey(pass, salt, 2, 19456, 1, 32)
// using golang.org/x/crypto/argon2.
func CreateSecret(server, apiKey, text string) (string, error) {
	linkKey := make([]byte, 32)
	rand.Read(linkKey)
	encKey := derive(linkKey, "vaultdrop/v1/enc")
	proof := derive(linkKey, "vaultdrop/v1/auth")

	block, _ := aes.NewCipher(encKey)
	gcm, _ := cipher.NewGCM(block)
	iv := make([]byte, 12)
	rand.Read(iv)
	ct := gcm.Seal(nil, iv, pad(text), []byte("vaultdrop/v1"))
	sum := sha256.Sum256(proof)

	payload, _ := json.Marshal(map[string]any{
		"envelope": map[string]any{
			"v": 1, "iv": b64u.EncodeToString(iv), "ct": b64u.EncodeToString(ct),
		},
		"kdf":       nil,
		"verifier":  b64u.EncodeToString(sum[:]),
		"expiresIn": 3600,
	})
	req, _ := http.NewRequest("POST", server+"/api/v1/secrets", bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("vaultdrop: HTTP %d", res.StatusCode)
	}
	var out struct {
		ShareUrlBase string \`json:"shareUrlBase"\`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", err
	}
	return out.ShareUrlBase + "#" + b64u.EncodeToString(linkKey), nil
}`;

export const WEBHOOK_VERIFY = `import { createHmac, timingSafeEqual } from "node:crypto";

// Header: "VaultDrop-Signature: t=1761650000,v1=5f1c…"
export function verifyVaultDropSignature(
  secret: string,
  header: string,
  rawBody: string,
): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2)));
  const t = Number(parts.t);
  // Reject stale timestamps (5-minute replay window).
  if (!Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest("hex");
  const given = String(parts.v1 ?? "");
  return (
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  );
}

// Also de-duplicate on the VaultDrop-Event-Id header:
// deliveries are retried and may arrive more than once.`;

export const WEBHOOK_PAYLOAD = `{
  "id": "evt_Qm9vYmFy…",
  "type": "secret.consumed",
  "createdAt": "2026-10-28T09:12:44.120Z",
  "data": {
    "secretId": "Xk2pR7…",
    "label": "staging DB for Sam",
    "state": "consumed",
    "viewCount": 1,
    "maxViews": 1,
    "expiresAt": "2026-10-29T09:10:02.000Z",
    "environment": "live"
  }
}`;

export const GITHUB_ACTIONS = `name: Share generated credentials
on: workflow_dispatch

jobs:
  share:
    runs-on: ubuntu-latest
    steps:
      - name: Share generated DB password with on-call
        env:
          VAULTDROP_API_KEY: \${{ secrets.VAULTDROP_API_KEY }}
        run: |
          LINK=$(printf '%s' "$GENERATED_PASSWORD" \\
            | npx -y vaultdrop --expires 2h --label "rotation $GITHUB_RUN_ID")
          echo "::add-mask::$LINK"
          # Post $LINK to your incident channel; it opens exactly once.`;
