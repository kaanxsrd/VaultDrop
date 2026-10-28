"use client";

import { Play, WandSparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/overlays";
import { Input, Label, Textarea } from "@/components/ui/primitives";

const PRESETS = [
  { value: "create", label: "POST /secrets", method: "POST", path: "/api/v1/secrets" },
  {
    value: "status",
    label: "GET /secrets/{id}/status",
    method: "GET",
    path: "/api/v1/secrets/{id}/status",
  },
  { value: "receipt", label: "GET /secrets/{id}", method: "GET", path: "/api/v1/secrets/{id}" },
  {
    value: "burn",
    label: "POST /secrets/{id}/burn",
    method: "POST",
    path: "/api/v1/secrets/{id}/burn",
  },
  { value: "list", label: "GET /secrets", method: "GET", path: "/api/v1/secrets?state=active" },
  { value: "usage", label: "GET /account/usage", method: "GET", path: "/api/v1/account/usage" },
];

/**
 * Interactive console against this deployment. Requests go to the same origin only. The
 * "encrypt sample" helper seals text in this tab so even test secrets stay end-to-end encrypted.
 */
export function ApiExplorer() {
  const [preset, setPreset] = useState("create");
  const [id, setId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [receipt, setReceipt] = useState("");
  const [body, setBody] = useState("");
  const [linkKey, setLinkKey] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = PRESETS.find((x) => x.value === preset)!;

  async function encryptSample() {
    const { sealSecret } = await import("@/lib/crypto/envelope");
    const sealed = await sealSecret("hello from the API console");
    setLinkKey(sealed.linkKey);
    setBody(
      JSON.stringify(
        { envelope: sealed.envelope, kdf: sealed.kdf, verifier: sealed.verifier, expiresIn: 900 },
        null,
        2,
      ),
    );
  }

  async function send() {
    setBusy(true);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    if (receipt) headers["X-Receipt-Token"] = receipt;
    const hasBody = p.method === "POST" && body.trim();
    if (hasBody) headers["Content-Type"] = "application/json";
    try {
      const res = await fetch(p.path.replace("{id}", encodeURIComponent(id)), {
        method: p.method,
        headers,
        body: hasBody ? body : undefined,
        credentials: "omit",
      });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
        const parsed = JSON.parse(text) as { id?: string; receiptToken?: string };
        if (parsed.id) setId(parsed.id);
        if (parsed.receiptToken) setReceipt(parsed.receiptToken);
      } catch {
        /* non-JSON */
      }
      setResponse(`HTTP ${res.status}\n${pretty}`);
    } catch {
      setResponse("Network error");
    }
    setBusy(false);
  }

  return (
    <div className="border-border bg-card shadow-soft flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-semibold">Try it</h2>
      <Select
        aria-label="Endpoint"
        value={preset}
        onValueChange={setPreset}
        options={PRESETS.map((x) => ({ value: x.value, label: x.label }))}
      />
      {p.path.includes("{id}") && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ex-id">Secret id</Label>
          <Input
            id="ex-id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ex-key">API key (optional)</Label>
        <Input
          id="ex-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="vd_test_…"
          className="font-mono text-xs"
        />
      </div>
      {(preset === "receipt" || preset === "burn") && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ex-receipt">Receipt token</Label>
          <Input
            id="ex-receipt"
            value={receipt}
            onChange={(e) => setReceipt(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
      )}
      {preset === "create" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ex-body">Body</Label>
            <Button type="button" size="sm" variant="ghost" onClick={() => void encryptSample()}>
              <WandSparkles /> Encrypt sample
            </Button>
          </div>
          <Textarea
            id="ex-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={7}
            className="font-mono text-[11px]"
          />
          {linkKey && (
            <p className="text-muted-foreground text-xs break-all">
              Link key (stays here): {linkKey}
            </p>
          )}
        </div>
      )}
      <Button onClick={() => void send()} loading={busy}>
        <Play /> Send request
      </Button>
      {response && (
        <pre
          className="bg-subtle max-h-72 overflow-auto rounded-lg p-3 font-mono text-[11px] whitespace-pre-wrap"
          aria-live="polite"
        >
          {response}
        </pre>
      )}
    </div>
  );
}
