"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { MetricChart, type SeriesColor } from "./metric-chart";

/**
 * One fixed-size metric block — the CloudWatch/Grafana-style dashboard
 * tile: a bordered card, a title, and an expand button in the corner.
 * Clicking expand re-renders the exact same chart larger inside a modal,
 * rather than a separate "detail" view — there is only ever one chart
 * implementation (MetricChart), so the compact and expanded views can
 * never drift out of sync with each other on colours, tooltip, or zoom
 * behaviour.
 *
 * Meant to sit in a grid (see the callers) rather than a vertical stack —
 * a fixed tile size is what makes a multi-metric dashboard scannable at a
 * glance, the same reason CloudWatch/Grafana dashboards use a tile grid
 * instead of one long scrolling column of full-width charts.
 */
export function MetricTile<T extends { recorded_at: string }>({
  title,
  samples,
  series,
  unit,
}: {
  title: string;
  samples: T[];
  series: { key: keyof T; label: string; color: SeriesColor }[];
  unit: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="hairline border-border bg-card flex flex-col gap-2 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <span className="text-foreground text-sm font-medium">{title}</span>
          <button
            onClick={() => setExpanded(true)}
            aria-label={`Expand ${title}`}
            title="Expand"
            className="text-muted-foreground hover:text-foreground hover:bg-muted -m-1 rounded p-1"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <MetricChart samples={samples} series={series} unit={unit} height={192} />
      </div>

      {expanded && (
        <Dialog
          title={title}
          onClose={() => setExpanded(false)}
          className="max-w-4xl"
        >
          <MetricChart samples={samples} series={series} unit={unit} height={420} />
        </Dialog>
      )}
    </>
  );
}
