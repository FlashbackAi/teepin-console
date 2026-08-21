"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Copy a value to the clipboard and briefly confirm.
 *
 * Shared by every "shown once" secret (enrollment tokens, API keys) — the
 * value cannot be recovered later, so a reliable copy affordance next to it
 * is the difference between a smooth setup and a lost credential.
 */
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard may be blocked (insecure context); silently ignore —
          // the value is still visible to select manually.
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}
