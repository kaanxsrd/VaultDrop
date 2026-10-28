"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  ...props
}: { value: string; label?: string; copiedLabel?: string } & Omit<
  ButtonProps,
  "onClick" | "value"
>) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  return (
    <Button
      type="button"
      {...props}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          toast(
            "Copying is blocked by your browser. Select the text and copy it manually.",
            "error",
          );
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  );
}
