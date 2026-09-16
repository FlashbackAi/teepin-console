"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Loading } from "@/components/ui/loading";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import { cn, timeAgo } from "@/lib/utils";
import type { Node, NodeCapacity } from "@/lib/api/types";
import { EnrollTokenDialog } from "./enroll-token-dialog";
import { ReservationDialog } from "./reservation-dialog";
import { RenameNodeDialog } from "./rename-dialog";

/**
 * Compute nodes (home-compute pilot).
 *
 * One list for all capacity — the datacenter GPU fleet and consumer-grade
 * home nodes together — distinguished by class. This page only works when the
 * control plane has home compute enabled; otherwise the routes 404 and we say
 * so plainly rather than showing a broken table.
 */
export default function ControlCenterNodesPage() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [reserving, setReserving] = useState<Node | null>(null);
  const [renaming, setRenaming] = useState<Node | null>(null);
  // When set, opens the token dialog prefilled to regenerate for this node.
  const [regenFor, setRegenFor] = useState<Node | null>(null);

  const nodes = useQuery({
    queryKey: ["admin", "nodes"],
    queryFn: admin.listNodes,
    retry: false, // a 404 (feature off) should not be retried
  });

  // Capacity rows keyed by node id, for the per-row rented/used/free display.
  const capByNode = new Map<string, NodeCapacity>();
  for (const c of nodes.data?.capacity ?? []) capByNode.set(c.node_id, c);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "nodes"] });

  const disable = useMutation({
    mutationFn: (id: string) => admin.disableNode(id),
    onSuccess: refresh,
  });

  const del = useMutation({
    mutationFn: (id: string) => admin.deleteNode(id),
    onSuccess: refresh,
    onError: (e) => alert(errorMessage(e)),
  });

  const featureOff =
    nodes.error instanceof ApiError && nodes.error.status === 404;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Control centre", href: "/controlcenter" }, "Nodes"]}
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Compute nodes</CardTitle>
            {!featureOff && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDialog(true)}
              >
                Generate enrollment token
              </Button>
            )}
          </CardHeader>

          {featureOff ? (
            <div className="text-muted-foreground px-4 py-6 text-sm">
              Home compute is not enabled on this control plane. Set{" "}
              <code className="text-foreground">HOME_COMPUTE_ENABLED=true</code>{" "}
              to enroll and manage nodes.
            </div>
          ) : nodes.isLoading ? (
            <Loading className="px-4 py-16" />
          ) : !nodes.data?.nodes.length ? (
            <EmptyState
              title="No nodes yet"
              description="Generate an enrollment token to add one."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Class</TH>
                  <TH>Specs</TH>
                  <TH>Rentable capacity</TH>
                  <TH>Status</TH>
                  <TH>Last seen</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {nodes.data.nodes.map((node) => (
                  <TR key={node.id}>
                    <TD className="font-medium">
                      <Link
                        href={`/controlcenter/nodes/${node.id}`}
                        className="identifier text-foreground hover:underline"
                      >
                        {node.node_name}
                      </Link>
                    </TD>
                    <TD>
                      <ClassPill nodeClass={node.class} />
                    </TD>
                    <TD className="text-muted-foreground">
                      {describeSpecs(node)}
                    </TD>
                    <TD className="text-muted-foreground">
                      {describeCapacity(node, capByNode.get(node.id))}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <NodeStatusPill status={node.status} />
                        {/* A node can be "online" (agent connected) while
                            its own Kubernetes is unreachable — distinct
                            from every other status, so it gets a SECOND
                            indicator rather than a new status value (which
                            would ripple into the exhaustive dot map above
                            and every status==='online' check on this
                            page). */}
                        {node.status === "online" && !node.k8s_ready && (
                          <NotSchedulableBadge />
                        )}
                      </div>
                    </TD>
                    <TD className="text-muted-foreground">
                      {node.last_seen_at ? timeAgo(node.last_seen_at) : "—"}
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {node.class === "home" && node.status !== "disabled" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setReserving(node)}
                          >
                            Reserve
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRenaming(node)}
                        >
                          Rename
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRegenFor(node)}
                        >
                          New token
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
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {showDialog && (
        <EnrollTokenDialog onClose={() => setShowDialog(false)} />
      )}
      {reserving && (
        <ReservationDialog
          node={reserving}
          onClose={() => setReserving(null)}
        />
      )}
      {renaming && (
        <RenameNodeDialog node={renaming} onClose={() => setRenaming(null)} />
      )}
      {regenFor && (
        <EnrollTokenDialog
          defaultLabel={regenFor.node_name}
          defaultClass={regenFor.class}
          onClose={() => setRegenFor(null)}
        />
      )}
    </>
  );
}

// describeCapacity renders "rented / used / free" for a home node. Datacenter
// nodes and nodes with nothing rented out show a dash.
function describeCapacity(node: Node, cap?: NodeCapacity): string {
  if (node.class !== "home") return "—";
  const rentable = node.rentable_cpu_cores ?? 0;
  if (rentable === 0 && !cap) return "not offered";
  if (!cap) return `${rentable} vCPU rented`;
  return `${cap.rentable_cpu_cores} vCPU rented · ${cap.used_cpu_cores} used · ${cap.free_cpu_cores} free`;
}

function describeSpecs(node: Node): string {
  const parts: string[] = [];
  if (node.cpu_cores) {
    // A detected P/E split is shown alongside the flat vCPU count rather
    // than replacing it — the split is informational, and placement still
    // reasons about total capacity first.
    const split =
      node.p_cores && node.p_cores > 0
        ? ` (${node.p_cores}P/${node.e_cores ?? 0}E)`
        : "";
    parts.push(`${node.cpu_cores} vCPU${split}`);
  }
  if (node.memory_gb) parts.push(`${node.memory_gb} GB`);
  // A consumer GPU is shown as an attribute, not sellable VRAM.
  if (node.gpu_count > 0 && node.gpu_model) {
    parts.push(`${node.gpu_count}× ${node.gpu_model}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

function ClassPill({ nodeClass }: { nodeClass: Node["class"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
        nodeClass === "home"
          ? "bg-muted text-muted-foreground"
          : "bg-muted text-foreground",
      )}
    >
      {nodeClass}
    </span>
  );
}

function NodeStatusPill({ status }: { status: Node["status"] }) {
  const dot: Record<Node["status"], string> = {
    online: "bg-success",
    enrolled: "bg-warning",
    offline: "bg-muted-foreground/50",
    disabled: "bg-destructive",
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", dot[status])}
        aria-hidden
      />
      <span className="text-foreground capitalize">{status}</span>
    </span>
  );
}

/**
 * Shown only when a node is "online" (its agent is connected) but its own
 * Kubernetes was unreachable as of its last report — "online" alone can no
 * longer be read as "can run workloads." Placement already excludes such a
 * node; this is what tells the operator WHY a node they can see is not
 * taking CPU instances.
 */
function NotSchedulableBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-warning text-xs"
      title="This node's agent is connected, but its local Kubernetes (k3s) is unreachable — it cannot run workloads until that's fixed. New CPU instances will not be placed here."
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
        aria-hidden
      />
      not schedulable
    </span>
  );
}
