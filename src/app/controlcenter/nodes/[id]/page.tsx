"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Stat,
} from "@/components/ui/card";
import { Loading } from "@/components/ui/loading";
import {
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import { cn, fullTime, timeAgo } from "@/lib/utils";
import { MetricTile } from "@/components/charts/metric-tile";
import {
  ClassPill,
  NodeStatusPill,
  NotSchedulableBadge,
  describeCapacity,
  describeLocation,
  describeSpecs,
} from "../node-format";
import { EnrollTokenDialog } from "../enroll-token-dialog";
import { ReservationDialog } from "../reservation-dialog";
import { RenameNodeDialog } from "../rename-dialog";
import { NodeLocationDialog } from "../location-dialog";
import { MountModelDialog } from "../mount-model-dialog";
import { CachedModelsCard } from "./cached-models-card";
import {
  ObservedStatePill,
  describeNodeServiceConfig,
  describeObservedEndpoint,
} from "../../inference/inference-format";

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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("1h");
  const [showReserve, setShowReserve] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showMount, setShowMount] = useState(false);

  // No GET-by-id endpoint exists for a single node — the list is small
  // enough (control-plane fleet size, not a customer-scale collection)
  // that reusing the already-cached list query is simpler than adding
  // one, same choice the accounts detail page already made.
  const nodes = useQuery({
    queryKey: ["admin", "nodes"],
    queryFn: admin.listNodes,
  });
  const node = nodes.data?.nodes.find((n) => n.id === id);

  // Same actions the fleet list offers per row (controlcenter/nodes/
  // page.tsx) — an operator who drilled into one node's detail page
  // should not have to go back to the list to manage it.
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "nodes"] });

  const disable = useMutation({
    mutationFn: (nodeId: string) => admin.disableNode(nodeId),
    onSuccess: refresh,
  });

  const del = useMutation({
    mutationFn: (nodeId: string) => admin.deleteNode(nodeId),
    // Unlike the list page, this page IS the node being deleted — nothing
    // left to show here once it succeeds, so leave for the list instead
    // of refetching into a "not found" state on this same URL.
    onSuccess: () => router.replace("/controlcenter/nodes"),
    onError: (e) => alert(errorMessage(e)),
  });

  const metrics = useQuery({
    queryKey: ["admin", "node-metrics", id, range],
    queryFn: () => admin.getNodeMetrics(id, range),
    refetchInterval: 30_000,
  });

  // Mounted services (Teepin Inference model servers today; a teepin-agent
  // binary update is meant to reuse this same list later). The Linux/CUDA
  // reconciler (pkg/inferencereconciler) converges the DESIRED state
  // Control Centre asked for into a real instance; this shows both that
  // and whatever observed_state/observed_endpoint it last reported, same
  // as the rest of this page shows live data.
  const nodeServices = useQuery({
    queryKey: ["admin", "node-services", id],
    queryFn: () => admin.listNodeServicesForNode(id),
    retry: false,
  });
  // `?? []`: a node with nothing mounted serializes as `node_services:
  // null` on some server versions (the same real bug found live
  // 2026-09-18 in modelcatalog.ListModels, fixed at the root — this guard
  // doesn't depend on that fix having actually rolled out yet).
  const mountedServices = nodeServices.data?.node_services ?? [];

  const unmount = useMutation({
    mutationFn: (serviceId: string) => admin.unmountNodeService(serviceId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["admin", "node-services", id],
      }),
    onError: (e) => alert(errorMessage(e)),
  });

  const samples = metrics.data?.samples ?? [];
  const latest = samples[samples.length - 1];
  const isGPU = (node?.gpu_count ?? 0) > 0;
  const capacity = nodes.data?.capacity?.find((c) => c.node_id === id);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Control centre", href: "/controlcenter" },
          { label: "Nodes", href: "/controlcenter/nodes" },
          node?.node_name ?? "…",
        ]}
      />

      <div className="flex flex-col gap-6 p-6">
        {/* Host information first, utilization second — this page used to
            open straight on the utilization charts with no way to see
            what the node actually IS (specs, P/E-core split, OS/arch,
            agent version) without going back to the list. */}
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                {node?.node_name ?? "…"}
                {node && <ClassPill nodeClass={node.class} />}
              </span>
            </CardTitle>
            {node && (
              <div className="flex flex-wrap items-center gap-2">
                <NodeStatusPill status={node.status} />
                {node.status === "online" && !node.k8s_ready && (
                  <NotSchedulableBadge />
                )}
                <div className="flex items-center gap-1">
                  {node.class === "home" && node.status !== "disabled" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowReserve(true)}
                    >
                      Reserve
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRename(true)}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowToken(true)}
                  >
                    New token
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLocation(true)}
                  >
                    Location
                  </Button>
                  {node.status !== "disabled" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={disable.isPending}
                      onClick={() => disable.mutate(node.id)}
                    >
                      Disable
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={del.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Delete node "${node.node_name}"? This removes it from the fleet. Active instances must be terminated first.`,
                        )
                      ) {
                        del.mutate(node.id);
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </CardHeader>

          {nodes.isLoading ? (
            <Loading className="px-4 py-10" />
          ) : !node ? (
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              Node not found.
            </div>
          ) : (
            <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
              <Detail label="Specs">{describeSpecs(node)}</Detail>
              <Detail label="Rentable capacity">
                {describeCapacity(node, capacity)}
              </Detail>
              <Detail label="OS / Arch">
                {node.os && node.arch ? `${node.os} / ${node.arch}` : "—"}
              </Detail>
              <Detail label="Agent version">{node.agent_version ?? "—"}</Detail>
              <Detail label="Location">{describeLocation(node)}</Detail>
              <Detail
                label="Last seen"
                title={
                  node.last_seen_at ? fullTime(node.last_seen_at) : undefined
                }
              >
                {node.last_seen_at ? timeAgo(node.last_seen_at) : "—"}
              </Detail>
              <Detail label="Created" title={fullTime(node.created_at)}>
                {timeAgo(node.created_at)}
              </Detail>
              <Detail label="Provider ID">
                <span className="identifier">{node.provider_id}</span>
              </Detail>
            </CardContent>
          )}
        </Card>

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
              No utilization data yet for this window — the node reports roughly
              every 30s once connected.
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Mounted services</CardTitle>
            {node &&
              !(
                nodeServices.error instanceof ApiError &&
                nodeServices.error.status === 404
              ) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowMount(true)}
                >
                  Mount model
                </Button>
              )}
          </CardHeader>

          {nodeServices.isLoading ? (
            <Loading className="px-4 py-10" />
          ) : nodeServices.isError ? (
            <div className="text-muted-foreground px-4 py-6 text-sm">
              {nodeServices.error instanceof ApiError &&
              nodeServices.error.status === 404
                ? "Teepin Inference is not available on this control plane."
                : errorMessage(nodeServices.error)}
            </div>
          ) : !mountedServices.length ? (
            <EmptyState
              title="Nothing mounted"
              description="Mount a self-hosted model to serve it from this node."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Kind</TH>
                  <TH>Config</TH>
                  <TH>Desired</TH>
                  <TH>Observed</TH>
                  <TH>Endpoint</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {mountedServices.map((service) => (
                  <TR key={service.id}>
                    <TD className="text-muted-foreground">{service.kind}</TD>
                    <TD className="identifier text-foreground">
                      {describeNodeServiceConfig(service)}
                    </TD>
                    <TD className="text-muted-foreground capitalize">
                      {service.desired_state}
                    </TD>
                    <TD>
                      <ObservedStatePill state={service.observed_state} />
                      {service.observed_state === "error" &&
                        service.observed_error && (
                          <span
                            className="text-destructive ml-1.5 text-xs"
                            title={service.observed_error}
                          >
                            (details)
                          </span>
                        )}
                    </TD>
                    <TD className="identifier text-muted-foreground">
                      {describeObservedEndpoint(service)}
                    </TD>
                    <TD className="text-right">
                      {service.desired_state === "mounted" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={unmount.isPending}
                          onClick={() => unmount.mutate(service.id)}
                        >
                          Unmount
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <CachedModelsCard nodeId={id} />
      </div>

      {showMount && node && (
        <MountModelDialog node={node} onClose={() => setShowMount(false)} />
      )}

      {showReserve && node && (
        <ReservationDialog node={node} onClose={() => setShowReserve(false)} />
      )}
      {showRename && node && (
        <RenameNodeDialog node={node} onClose={() => setShowRename(false)} />
      )}
      {showToken && node && (
        <EnrollTokenDialog
          defaultLabel={node.node_name}
          defaultClass={node.class}
          onClose={() => setShowToken(false)}
        />
      )}
      {showLocation && node && (
        <NodeLocationDialog
          node={node}
          onClose={() => setShowLocation(false)}
        />
      )}
    </>
  );
}

function Detail({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1" title={title}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-foreground text-sm">{children}</span>
    </div>
  );
}
