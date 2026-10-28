"use client";

import { Plus } from "lucide-react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import type { ReactNode } from "react";

/** Radix accordion with height animation driven by --radix-accordion-content-height. */
export function Accordion({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <AccordionPrimitive.Root
      type="single"
      collapsible
      className="divide-border border-border bg-card shadow-soft divide-y rounded-xl border"
    >
      {items.map((it, i) => (
        <AccordionPrimitive.Item key={it.q} value={`item-${i}`}>
          <AccordionPrimitive.Header>
            <AccordionPrimitive.Trigger className="group hover:text-primary flex w-full items-center justify-between gap-4 rounded-xl px-5 py-4 text-left font-medium transition-colors">
              {it.q}
              <span className="border-border text-muted-foreground group-hover:border-primary/40 group-data-[state=open]:bg-primary group-data-[state=open]:text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full border transition-[transform,background-color,color] duration-300 group-data-[state=open]:rotate-45">
                <Plus className="size-3.5" aria-hidden />
              </span>
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="text-muted-foreground data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm">
            <div className="px-5 pb-5">{it.a}</div>
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}
