"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";

export function CodeCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast(
            "Copying is blocked by your browser. Select the code and copy it manually.",
            "error",
          );
        }
      }}
      className="grid size-7 place-items-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-[#45d1a5]"
      aria-label={copied ? "Copied" : "Copy code"}
    >
      {copied ? <Check className="size-3.5 text-[#45d1a5]" /> : <Copy className="size-3.5" />}
    </button>
  );
}
