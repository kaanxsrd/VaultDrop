"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Sticky "On this page" navigation that highlights the section currently in view. */
export function DocsToc({ items }: { items: readonly (readonly [string, string])[] }) {
  const [active, setActive] = useState<string>(items[0]?.[0] ?? "");

  useEffect(() => {
    const headings = items
      .map(([id]) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // A heading becomes "current" once it reaches the upper third of the viewport.
      { rootMargin: "-80px 0px -66% 0px" },
    );
    for (const h of headings) observer.observe(h);
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page" className="hidden lg:block">
      <div className="sticky top-24">
        <p className="text-muted-foreground mb-3 px-3 text-xs font-medium tracking-wider uppercase">
          On this page
        </p>
        <ul className="border-border relative flex flex-col border-l text-sm">
          {items.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={active === id ? "location" : undefined}
                className={cn(
                  "-ml-px block border-l-2 py-1.5 pl-3 transition-colors duration-200",
                  active === id
                    ? "border-primary text-foreground font-medium"
                    : "text-muted-foreground hover:border-border hover:text-foreground border-transparent",
                )}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
        <Link
          href="/docs/api"
          className="text-primary mt-5 inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium hover:underline"
        >
          API reference →
        </Link>
      </div>
    </nav>
  );
}
