import { cn } from "@/lib/utils";
import type { Node, NodeCapacity } from "@/lib/api/types";

/**
 * Shared node display helpers — used by both the fleet list
 * (controlcenter/nodes/page.tsx) and one node's own detail page
 * (controlcenter/nodes/[id]/page.tsx), so a spec/status/capacity reads
 * identically in both places.
 */

// describeCapacity renders "rented / used / free" for a home node.
// Datacenter nodes and nodes with nothing rented out show a dash.
export function describeCapacity(node: Node, cap?: NodeCapacity): string {
  if (node.class !== "home") return "—";
  const rentable = node.rentable_cpu_cores ?? 0;
  if (rentable === 0 && !cap) return "not offered";
  if (!cap) return `${rentable} vCPU rented`;
  return `${cap.rentable_cpu_cores} vCPU rented · ${cap.used_cpu_cores} used · ${cap.free_cpu_cores} free`;
}

// describeLocation renders the FULL, exact coordinate an operator
// submitted (never the rounded ~11km version the public globe gets —
// that rounding happens only in the separate public query, see
// pkg/nodes.PublicNodeLocation) alongside the saved label. Operator-only
// surface (Control Centre), so there is no reason to round anything here.
export function describeLocation(node: Node): string {
  const hasCoords = node.latitude !== undefined && node.longitude !== undefined;
  const coords = hasCoords ? `${node.latitude}, ${node.longitude}` : "";
  if (node.location_label && coords) return `${node.location_label} — ${coords}`;
  return node.location_label || coords || "—";
}

export function describeSpecs(node: Node): string {
  const parts: string[] = [];
  if (node.cpu_cores) {
    // The detected P/E split used to be appended here (` (8P/16E)`) —
    // DISABLED (2026-09-16) alongside the customer-facing P/E-core input
    // in create-cpu-dialog.tsx: the split only ever affected billing/
    // capacity accounting, never real CPU scheduling, so showing it as
    // if it were a hardware guarantee was misleading on both fronts.
    // Re-enable by restoring the two lines below once real cpuset-level
    // enforcement exists.
    // const split =
    //   node.p_cores && node.p_cores > 0
    //     ? ` (${node.p_cores}P/${node.e_cores ?? 0}E)`
    //     : "";
    parts.push(`${node.cpu_cores} vCPU`);
  }
  if (node.memory_gb) parts.push(`${node.memory_gb} GB`);
  // A consumer GPU is shown as an attribute, not sellable VRAM.
  if (node.gpu_count > 0 && node.gpu_model) {
    parts.push(`${node.gpu_count}× ${node.gpu_model}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

export function ClassPill({ nodeClass }: { nodeClass: Node["class"] }) {
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

export function NodeStatusPill({ status }: { status: Node["status"] }) {
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
export function NotSchedulableBadge() {
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
