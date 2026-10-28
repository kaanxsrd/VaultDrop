"use client";

import { ArrowRight, EyeOff, KeyRound, LockKeyhole, Monitor, Server } from "lucide-react";
import { useInView } from "motion/react";
import { type PointerEvent, useCallback, useRef } from "react";
import { Stagger, StaggerItem } from "@/components/motion/primitives";

/**
 * "How it works" as three live mini-visualisations. Animations are pure CSS (see the
 * .hiw-* rules in globals.css), paused while offscreen, and their resting styles are the
 * meaningful end state — which is what reduced-motion users see.
 */

function EncryptVisual() {
  return (
    <div className="hiw-panel w-[88%] max-w-72">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] tracking-wider uppercase">
        <span className="size-1.5 rounded-full bg-[#febc2e]" /> secret.env
      </div>
      <div className="relative mt-2 h-5 overflow-hidden font-mono text-[12px]">
        <span className="text-foreground absolute inset-0 whitespace-nowrap">
          DB_PASS=hunter2-prod-42
        </span>
        <span className="hiw-cipher bg-card text-primary absolute inset-0 whitespace-nowrap">
          9fQ2xL0eTz8aMw4KrB7vN1c
        </span>
        <span className="hiw-scan absolute top-0 h-full w-10" />
      </div>
      <div className="text-muted-foreground mt-2 flex items-center justify-between font-mono text-[10px]">
        <span>AES-256-GCM · 256-bit key</span>
        <span className="hiw-sealed text-primary inline-flex items-center gap-1">
          <LockKeyhole className="size-3" aria-hidden /> sealed
        </span>
      </div>
    </div>
  );
}

function ShareVisual() {
  return (
    <div className="flex w-[90%] max-w-76 flex-col gap-3">
      <div className="hiw-panel flex items-center gap-1.5 rounded-full py-1.5! font-mono text-[11px]">
        <LockKeyhole className="text-primary size-3 shrink-0" aria-hidden />
        <span className="text-muted-foreground truncate">vaultdrop.example/s/</span>
        <span className="text-foreground">Xk2p…</span>
        <span className="hiw-key bg-primary-soft text-primary-soft-foreground rounded px-1 font-semibold">
          #M3f9…
        </span>
      </div>
      <div className="relative flex items-center justify-between px-1">
        <div className="hiw-node">
          <Monitor className="size-3.5" aria-hidden />
          <span>Browser</span>
        </div>
        <div className="relative mx-2 h-px flex-1 bg-[repeating-linear-gradient(90deg,var(--border)_0_4px,transparent_4px_8px)]">
          <span className="hiw-packet bg-primary-soft text-primary-soft-foreground absolute -top-2.5 rounded px-1 font-mono text-[9px] leading-5">
            id
          </span>
        </div>
        <div className="hiw-node">
          <Server className="size-3.5" aria-hidden />
          <span>Server</span>
        </div>
      </div>
      <p className="text-muted-foreground -mt-1 pl-1 font-mono text-[10px]">
        <span className="text-primary">#key</span> stays in the browser — never sent
      </p>
    </div>
  );
}

function DestroyVisual() {
  return (
    <div className="hiw-panel relative w-[78%] max-w-60">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground tracking-wider uppercase">one-time secret</span>
        <span className="relative h-4 w-14 text-right font-mono">
          <span className="hiw-views-before text-foreground absolute inset-0">1 view</span>
          <span className="hiw-views-after text-muted-foreground absolute inset-0">0 views</span>
        </span>
      </div>
      <div className="relative mt-2.5 space-y-1.5">
        <div className="hiw-burn space-y-1.5">
          <div className="bg-foreground/20 h-1.5 w-[85%] rounded-full" />
          <div className="bg-foreground/20 h-1.5 w-[62%] rounded-full" />
          <div className="bg-foreground/20 h-1.5 w-[74%] rounded-full" />
        </div>
        {/* Evaporating pixels — the same motif as the logo's dissolving tip. */}
        {[12, 30, 46, 58, 70, 84].map((left, i) => (
          <span
            key={left}
            className="hiw-pixel bg-primary absolute size-1 rounded-[1px]"
            style={{ left: `${left}%`, top: `${(i % 3) * 7 + 2}px`, animationDelay: `${i * 70}ms` }}
          />
        ))}
        <div className="hiw-destroyed absolute inset-0 grid place-items-center">
          <span className="border-destructive/40 bg-destructive-soft text-destructive rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-widest uppercase">
            Destroyed
          </span>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: LockKeyhole,
    title: "Encrypt in your browser",
    body: "Your secret is sealed with AES-256-GCM before it leaves this page, using a fresh random key.",
    tags: ["AES-256-GCM", "HKDF", "Client-side"],
    Visual: EncryptVisual,
  },
  {
    icon: KeyRound,
    title: "Share one link",
    body: "The key rides in the link after “#”, a part browsers never send to servers. Add a passphrase for a second factor.",
    tags: ["URL fragment", "128-bit id", "Argon2id"],
    Visual: ShareVisual,
  },
  {
    icon: EyeOff,
    title: "Read once, then gone",
    body: "The recipient opens it, it decrypts on their device, and the ciphertext is deleted from our database in the same step.",
    tags: ["Row-locked", "Atomic delete", "Single view"],
    Visual: DestroyVisual,
  },
];

export function HowItWorksSteps() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-60px" });
  const frame = useRef(0);

  // Group spotlight: every card tracks the pointer, so the glow bleeds across neighbours.
  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      for (const card of ref.current?.querySelectorAll<HTMLElement>(".spotlight-card") ?? []) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${clientX - r.left}px`);
        card.style.setProperty("--my", `${clientY - r.top}px`);
      }
    });
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      data-animate={inView ? "on" : "off"}
      className="hiw-group relative mt-10"
    >
      <Stagger as="ol" className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <StaggerItem
            as="li"
            lift
            key={s.title}
            className="spotlight-card border-border bg-card shadow-soft group relative overflow-hidden rounded-2xl border"
          >
            <div className="hiw-stage border-border relative z-[1] grid h-40 place-items-center overflow-hidden border-b">
              <s.Visual />
            </div>
            <div className="relative z-[1] p-6">
              <div className="flex items-center gap-2.5">
                <span className="border-primary/30 bg-primary-soft/60 text-primary-soft-foreground inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-widest uppercase">
                  <span className="bg-primary size-1.5 rounded-full" />
                  Step 0{i + 1}
                </span>
                <s.icon className="text-muted-foreground size-4" aria-hidden />
              </div>
              <h3 className="mt-3 text-lg font-semibold tracking-tight">{s.title}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm">{s.body}</p>
              <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Technologies">
                {s.tags.map((t) => (
                  <li
                    key={t}
                    className="border-border bg-subtle text-muted-foreground rounded-md border px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
      {/* Flow connectors centred in the gaps, level with the visuals (md+). */}
      {["calc((100% - 2rem) / 3 + 0.5rem)", "calc((100% - 2rem) / 3 * 2 + 1.5rem)"].map((left) => (
        <span
          key={left}
          aria-hidden
          className="hiw-connector pointer-events-none absolute top-20 z-10 hidden -translate-x-1/2 -translate-y-1/2 md:grid"
          style={{ left }}
        >
          <ArrowRight className="size-3.5" />
        </span>
      ))}
    </div>
  );
}
