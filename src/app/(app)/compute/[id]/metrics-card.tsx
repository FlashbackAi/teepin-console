"use client";

import { useState } from "react";

import { MetricTile } from "@/components/charts/metric-tile";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, Stat } from "@/components/ui/card";
import { Loading } from "@/components/ui/loading";
import { errorMessage, useInstanceMetrics } from "@/lib/api/hooks";
import { fullTime } from "@/lib/utils";

/** Go duration strings the server's ?since accepts. "1h" matches
 *  ListInstanceMetrics' own DefaultInstanceMetricsWindow. */
const RANGES = [
  { id: "1h", label: "1h" },
  { id: "6h", label: "6h" },
  { id: "24h", label: "24h" },
  { id: "168h", label: "7d" },
] as const;

/**
 * One instance's utilization history — the console's read side of the
 * per-instance telemetry pipeline. CPU% is relative to what THIS
 * instance was provisioned with (cpu_units), not host capacity: "am I
 * using what I'm paying for" is the question this answers.
 *
 * Mounted alongside Logs/Terminal on the instance detail page, kept
 * mounted-but-hidden when another tab is active (same convention that
 * page already uses for Terminal's live WebSocket) so switching tabs
 * does not tear down the chart's own state or refetch cadence.
 */
export function MetricsCard({ id, active }: { id: string; active: boolean }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("1h");
  const metrics = useInstanceMetrics(id, range, active);

  const samples = metrics.data?.samples ?? [];
  const latest = samples[samples.length - 1];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Utilization</CardTitle>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.id}
              variant={r.id === range ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </CardHeader>

      {metrics.isLoading ? (
        <Loading className="px-4 py-16" />
      ) : metrics.isError ? (
        <div className="text-muted-foreground px-4 py-10 text-center text-sm">
          {errorMessage(metrics.error)}
        </div>
      ) : samples.length === 0 ? (
        <div className="text-muted-foreground px-4 py-10 text-center text-sm">
          No utilization data yet for this window — readings arrive
          roughly every 30s once the instance is running.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 px-4 py-3 lg:grid-cols-4">
            <Stat
              label="CPU"
              value={`${latest.cpu_used_percent.toFixed(1)}%`}
              hint="of your provisioned vCPUs"
            />
            <Stat
              label="Memory"
              value={`${latest.memory_used_gb.toFixed(2)} GB`}
            />
            <Stat
              label="Network"
              value={`↓${latest.network_rx_mbps.toFixed(1)} ↑${latest.network_tx_mbps.toFixed(1)} MB/s`}
            />
            <Stat label="As of" value={fullTime(latest.recorded_at)} />
          </div>

          <div className="grid grid-cols-1 gap-4 px-4 pb-4 md:grid-cols-2">
            <MetricTile
              title="CPU"
              samples={samples}
              unit="%"
              series={[
                { key: "cpu_used_percent", label: "CPU", color: "info" },
              ]}
            />
            <MetricTile
              title="Memory"
              samples={samples}
              unit="GB"
              series={[
                { key: "memory_used_gb", label: "Memory", color: "info" },
              ]}
            />
            <MetricTile
              title="Network"
              samples={samples}
              unit="MB/s"
              series={[
                { key: "network_rx_mbps", label: "RX", color: "success" },
                { key: "network_tx_mbps", label: "TX", color: "warning" },
              ]}
            />
            {samples.some((s) => s.storage_used_gb > 0) && (
              <MetricTile
                title="Ephemeral storage used"
                samples={samples}
                unit="GB"
                series={[
                  { key: "storage_used_gb", label: "Storage", color: "info" },
                ]}
              />
            )}
          </div>
        </>
      )}
    </Card>
  );
}
