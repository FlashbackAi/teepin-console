"use client";

/**
 * Preview / Code icon-button switcher for the result panel — the pattern
 * the user pointed to directly from this app's own top-right Terminal/
 * Files/Browser tab row (a screenshot of it, mid-conversation). Icon
 * buttons, not the text-label Tabs component (components/ui/tabs.tsx):
 * that component's underline styling is built for a handful of named
 * views in a page header, not a compact two-way switch sitting inside a
 * split-pane toolbar.
 */

import { Code2, MonitorPlay } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ResultPanelTab = "preview" | "code";

export function ResultPanelSwitcher({
  active,
  onChange,
}: {
  active: ResultPanelTab;
  onChange: (tab: ResultPanelTab) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        aria-pressed={active === "preview"}
        title="Preview"
        onClick={() => onChange("preview")}
        className={cn(active === "preview" && "bg-muted text-foreground")}
      >
        <MonitorPlay className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-pressed={active === "code"}
        title="Code"
        onClick={() => onChange("code")}
        className={cn(active === "code" && "bg-muted text-foreground")}
      >
        <Code2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
