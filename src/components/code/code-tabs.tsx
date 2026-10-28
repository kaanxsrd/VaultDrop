"use client";

import { Tabs } from "radix-ui";
import type { ReactNode } from "react";

/** Language switcher for equivalent examples. Panels are server-rendered CodeBlocks. */
export function CodeTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { id: string; label: string; content: ReactNode }[];
}) {
  return (
    <Tabs.Root defaultValue={tabs[0]?.id} className="my-5">
      <Tabs.List aria-label={label} className="bg-muted mb-2 inline-flex gap-1 rounded-lg p-1">
        {tabs.map((t) => (
          <Tabs.Trigger
            key={t.id}
            value={t.id}
            className="text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors data-[state=active]:shadow-xs"
          >
            {t.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {tabs.map((t) => (
        <Tabs.Content key={t.id} value={t.id} className="data-[state=active]:animate-fade-in">
          {t.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
