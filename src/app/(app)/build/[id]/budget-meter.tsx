"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { errorMessage, useIncreaseKumbhaBudget } from "@/lib/api/hooks";
import { cn, formatCost } from "@/lib/utils";
import type { KumbhaSession } from "@/lib/api/types";

// Quick-add amounts for the "Raise budget" control — deliberately the
// same figures the composer's now-removed up-front picker offered
// (BUDGET_PRESETS, build/page.tsx), so this is a familiar increment, not
// a brand new number for the customer to reason about.
const RAISE_PRESETS = [5, 10, 25] as const;

/**
 * The build session's live spend against its pre-authorised budget — the
 * agent's own reasoning cost, never the infrastructure it creates (see
 * DeploymentPlanModal for that, a wholly separate figure).
 *
 * A slim bar, not a StatusPill: this isn't a running/failed binary, it's
 * a continuous quantity approaching a ceiling, and colour escalates
 * through the same --warning/--destructive tokens the rest of the
 * console already uses for exactly that shape of signal — no new palette
 * invented for this one meter.
 *
 * Every session now starts at a fixed server-side default (the
 * composer's own up-front budget picker was removed — a customer cannot
 * sensibly judge a build's cost before it has started) — this is where
 * they ask for more instead, once there is real spend to judge it
 * against.
 */
export function BudgetMeter({ session }: { session: KumbhaSession }) {
  const [raising, setRaising] = useState(false);
  const increase = useIncreaseKumbhaBudget(session.id);

  const fraction =
    session.budget > 0 ? Math.min(session.spent / session.budget, 1) : 0;
  const tone =
    fraction >= 0.9
      ? "bg-destructive"
      : fraction >= 0.7
        ? "bg-warning"
        : "bg-foreground";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">Build budget</span>
        <span className="flex items-center gap-1.5">
          <span className="tabular text-foreground">
            {formatCost(session.spent)}{" "}
            <span className="text-muted-foreground">
              / {formatCost(session.budget)}
            </span>
          </span>
          {session.status === "open" && !raising && (
            <button
              type="button"
              onClick={() => setRaising(true)}
              title="Raise budget"
              className="text-muted-foreground hover:text-foreground inline-flex items-center"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            tone,
          )}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>

      {raising && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-muted-foreground text-xs">Add:</span>
          {RAISE_PRESETS.map((amount) => (
            <Button
              key={amount}
              variant="outline"
              size="sm"
              disabled={increase.isPending}
              onClick={() =>
                increase.mutate(session.budget + amount, {
                  onSuccess: () => setRaising(false),
                })
              }
            >
              {increase.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                `+${formatCost(amount)}`
              )}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setRaising(false)}>
            Cancel
          </Button>
        </div>
      )}
      {increase.isError && (
        <p className="text-destructive text-xs">{errorMessage(increase.error)}</p>
      )}
    </div>
  );
}
