"use client";

import { LazyMotion, MotionConfig, m, type Variants } from "motion/react";
import type { ReactNode } from "react";

/**
 * Motion setup for marketing pages. Features load lazily (LazyMotion + `m`), so animation code
 * stays out of the critical path. `reducedMotion="user"` drops transforms for people who ask for
 * less motion. Everything carries `data-reveal`, which a <noscript> rule forces visible.
 */
const loadFeatures = () => import("./features").then((mod) => mod.default);
const EASE = [0.22, 1, 0.36, 1] as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** Fades and lifts content into place the first time it scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <m.div
      data-reveal
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </m.div>
  );
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

/** Staggers its StaggerItem children in as the group scrolls into view. */
export function Stagger({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "ol" | "ul" | "dl";
}) {
  const Comp = m[as];
  return (
    <Comp
      data-reveal
      className={className}
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
    >
      {children}
    </Comp>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
  lift = false,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li";
  /** Raise slightly on hover (cards). */
  lift?: boolean;
}) {
  const Comp = m[as];
  return (
    <Comp
      data-reveal
      className={className}
      variants={item}
      whileHover={lift ? { y: -4, transition: { duration: 0.25, ease: EASE } } : undefined}
    >
      {children}
    </Comp>
  );
}
