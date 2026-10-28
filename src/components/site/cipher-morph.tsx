"use client";

import { LockKeyhole } from "lucide-react";
import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const SAMPLES = [
  "DATABASE_URL=postgres://admin:S3cr3t@db.internal/prod",
  "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCY",
  "Wi-Fi: Lantern-Guest · orchid-lantern-42",
  "Recovery codes: 7F3K-92QX · LM4P-0ZR8 · Q1VD-66TB",
];
const NOISE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

type Phase = "plain" | "scramble" | "cipher";

/**
 * Live illustration of client-side encryption: each sample is sealed with the real VaultDrop
 * envelope (AES-256-GCM, fresh key) in this browser, then the visible text "scrambles" into the
 * actual ciphertext. Pauses offscreen; with reduced motion it swaps text without scrambling.
 */
export function CipherMorph() {
  const ref = useRef<HTMLDivElement>(null);
  const index = useRef(0);
  const inView = useInView(ref, { margin: "-80px" });
  const reduced = useReducedMotion();
  const [plain, setPlain] = useState(SAMPLES[0] ?? "");
  const [stored, setStored] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("plain");

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms)));

    void (async () => {
      const { sealSecret } = await import("@/lib/crypto/envelope");
      while (!cancelled) {
        const text = SAMPLES[index.current] ?? "";
        setPlain(text);
        setPhase("plain");
        const ct = (await sealSecret(text)).envelope.ct.slice(0, Math.max(text.length, 44));
        await wait(1500);
        if (cancelled) break;
        setPhase("scramble");
        if (!reduced) {
          const steps = 20;
          for (let s = 1; s <= steps && !cancelled; s++) {
            const settled = Math.floor((s / steps) * ct.length);
            let noise = "";
            for (let k = settled; k < ct.length; k++)
              noise += NOISE[Math.floor(Math.random() * NOISE.length)];
            setStored(ct.slice(0, settled) + noise);
            await wait(40);
          }
        }
        if (cancelled) break;
        setStored(ct);
        setPhase("cipher");
        await wait(2800);
        index.current = (index.current + 1) % SAMPLES.length;
      }
    })();

    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
    };
  }, [inView, reduced]);

  return (
    <div
      ref={ref}
      className="shadow-lifted relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f14] p-5 text-[#cdd6f4]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full bg-[radial-gradient(closest-side,rgb(69_209_165/0.28),transparent)]"
      />
      <div className="relative flex items-center gap-2 text-xs font-medium tracking-wider text-[#a2f5da] uppercase">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#45d1a5] opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-[#45d1a5]" />
        </span>
        Live · encrypted in this browser
      </div>

      <div className="relative mt-4 space-y-4 font-mono text-[13px] leading-relaxed">
        <div>
          <div className="mb-1 text-[11px] tracking-wider text-white/40 uppercase">You type</div>
          <div className="min-h-[2lh] break-all text-[#a6e3a1]">{plain}</div>
        </div>
        <div className="flex items-center gap-2 text-white/35">
          <span className="h-px flex-1 bg-linear-to-r from-transparent to-white/15" />
          <LockKeyhole
            className={`size-4 transition-colors duration-500 ${phase === "plain" ? "" : "text-[#45d1a5]"}`}
            aria-hidden
          />
          <span className="text-[11px]">AES-256-GCM</span>
          <span className="h-px flex-1 bg-linear-to-l from-transparent to-white/15" />
        </div>
        <div>
          <div className="mb-1 text-[11px] tracking-wider text-white/40 uppercase">
            VaultDrop stores
          </div>
          <div
            className={`min-h-[2lh] break-all transition-colors duration-500 ${phase === "cipher" ? "text-[#89b4fa]" : "text-[#cba6f7]/80"}`}
          >
            {stored ?? "············································"}
          </div>
        </div>
      </div>
      <p className="relative mt-4 text-[12px] text-white/45">
        Real ciphertext, sealed with a fresh 256-bit key each time. The key never leaves the page.
      </p>
    </div>
  );
}
