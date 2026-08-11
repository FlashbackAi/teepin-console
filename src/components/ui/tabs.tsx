"use client";

import { cn } from "@/lib/utils";

/**
 * Tabs.
 *
 * Not URL-routed (no /billing/usage sub-path) — deliberately. AWS's own
 * Bills page keeps its tabs as client-side state under one URL, and a
 * customer switching between "what am I being charged" and "what have I
 * been sent" is browsing one page's facets, not navigating to a
 * different resource. Invoice DETAIL is a different matter (its own
 * page, its own URL — see /billing/invoices/[id]) because a customer
 * references one specific invoice later, in a support ticket or their
 * own accounting; nobody bookmarks "the Usage tab".
 *
 * The active tab uses the same quiet convention as the sidebar's
 * NavLink: a filled background, not a color underline. No signature
 * accent anywhere in this console — see globals.css.
 */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; badge?: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      className="hairline-b flex gap-1 border-border px-6"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === active}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-t-md px-3 text-sm",
            "border-b-2 -mb-px transition-colors duration-100",
            tab.id === active
              ? "border-foreground text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {tab.label}
          {tab.badge && (
            <span className="tabular text-muted-foreground text-xs">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
