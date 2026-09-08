"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, Stat } from "@/components/ui/card";
import { Loading } from "@/components/ui/loading";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import { cn, fullTime } from "@/lib/utils";
import { MetricTile } from "@/components/charts/metric-tile";

/** Go duration strings the server's ?since accepts. "1h" matches
 *  ListMetrics' own DefaultMetricsWindow, so the initial load and the
 *  default range selection agree on what "no range chosen" means. */
const RANGES = [
  { id: "1h", label: "1h" },
  { id: "6h", label: "6h" },
  { id: "24h", label: "24h" },
  { id: "168h", label: "7d" },
] as const;

/**
 * One node's utilization history — the control-centre read side of the
 * telemetry pipeline (ROADMAP.md 2026-09-04). Specs (cpu_cores, memory_gb
 * on `Node`) are static CAPACITY; everything on this page is CURRENT USE,
 * refetched on the same ~30s cadence the agent reports on so the page
 * stays live without a manual refresh.
 */
export default function ControlCenterNodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("1h");

  // No GET-by-id endpoint exists for a single node — the list is small
  // enough (control-plane fleet size, not a customer-scale collection)
  // that reusing the already-cached list query is simpler than adding
  // one, same choice the accounts detail page already made.
  const nodes = useQuery({
    queryKey: ["admin", "nodes"],
    queryFn: admin.listNodes,
  });
  const node = nodes.data?.nodes.find((n) => n.id === id);

  const metrics = useQuery({
    queryKey: ["admin", "node-metrics", id, range],
    queryFn: () => admin.getNodeMetrics(id, range),
    refetchInterval: 30_000,
  });

  const samples = metrics.data?.samples ?? [];
  const latest = samples[samples.length - 1];
  const isGPU = (node?.gpu_count ?? 0) > 0;

  return (
    <>
      <PageHeader
        breadcrumb={["Control centre", "Nodes", node?.node_name ?? "…"]}
      />

      <div className="flex flex-col gap-6 p-6">
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
              No utilization data yet for this window — the node reports
              roughly every 30s once connected.
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "grid grid-cols-2 gap-x-8 gap-y-4 px-4 py-3",
                  isGPU ? "lg:grid-cols-6" : "lg:grid-cols-5",
                )}
              >
                <Stat
                  label="CPU"
                  value={`${latest.cpu_used_percent.toFixed(1)}%`}
                />
                <Stat
                  label="Memory"
                  value={`${latest.memory_used_gb.toFixed(2)} GB`}
                />
                {isGPU && (
                  <Stat
                    label="GPU VRAM"
                    value={`${latest.gpu_used_vram_gb.toFixed(1)} GB`}
                  />
                )}
                <Stat
                  label="Network"
                  value={`↓${latest.network_rx_mbps.toFixed(1)} ↑${latest.network_tx_mbps.toFixed(1)} MB/s`}
                />
                <Stat
                  label="Storage"
                  value={`R${latest.storage_read_mbps.toFixed(1)} W${latest.storage_write_mbps.toFixed(1)} MB/s`}
                />
                <Stat label="As of" value={fullTime(latest.recorded_at)} />
              </div>

              <div className="grid grid-cols-1 gap-4 px-4 pb-4 md:grid-cols-2">
                <MetricTile
                  title="CPU"
                  samples={samples}
                  unit="%"
                  series={[
                    {
                      key: "cpu_used_percent",
                      label: "CPU",
                      color: "info",
                    },
                  ]}
                />
                <MetricTile
                  title="Memory"
                  samples={samples}
                  unit="GB"
                  series={[
                    {
                      key: "memory_used_gb",
                      label: "Memory",
                      color: "info",
                    },
                  ]}
                />
                {isGPU && (
                  <MetricTile
                    title="GPU VRAM"
                    samples={samples}
                    unit="GB"
                    series={[
                      {
                        key: "gpu_used_vram_gb",
                        label: "VRAM",
                        color: "info",
                      },
                    ]}
                  />
                )}
                <MetricTile
                  title="Network"
                  samples={samples}
                  unit="MB/s"
                  series={[
                    {
                      key: "network_rx_mbps",
                      label: "RX",
                      color: "success",
                    },
                    {
                      key: "network_tx_mbps",
                      label: "TX",
                      color: "warning",
                    },
                  ]}
                />
                <MetricTile
                  title="Storage"
                  samples={samples}
                  unit="MB/s"
                  series={[
                    {
                      key: "storage_read_mbps",
                      label: "Read",
                      color: "success",
                    },
                    {
                      key: "storage_write_mbps",
                      label: "Write",
                      color: "warning",
                    },
                  ]}
                />
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
