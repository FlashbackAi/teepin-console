import { cn } from "@/lib/utils";
import type { InferenceModel, NodeServiceRecord } from "@/lib/api/types";

/**
 * Shared display helpers for Teepin Inference's model catalog and the
 * generic node_services mount/unmount primitive — used by the catalog
 * page (controlcenter/inference) and one node's "mounted services"
 * section (controlcenter/nodes/[id]), same reasoning node-format.tsx
 * already applies to node specs/status.
 */

export function CostClassPill({ costClass }: { costClass: InferenceModel["cost_class"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
        costClass === "own"
          ? "bg-muted text-muted-foreground"
          : "bg-muted text-foreground",
      )}
    >
      {costClass}
    </span>
  );
}

export function EnabledPill({ enabled }: { enabled: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
          enabled ? "bg-success" : "bg-muted-foreground/50",
        )}
        aria-hidden
      />
      <span className="text-foreground">{enabled ? "Enabled" : "Disabled"}</span>
    </span>
  );
}

export function describeCapabilities(model: InferenceModel): string {
  const parts: string[] = [];
  if (model.supports_tools) parts.push("Tools");
  if (model.supports_vision) parts.push("Vision");
  if (model.supports_audio) parts.push("Audio");
  return parts.length ? parts.join(" · ") : "—";
}

export function describeModelPricing(model: InferenceModel): string {
  if (model.input_price_per_million === 0 && model.output_price_per_million === 0) {
    return "Not priced";
  }
  return `$${model.input_price_per_million}/M in · $${model.output_price_per_million}/M out`;
}

/** ObservedState -> a dot colour, mirroring NodeStatusPill's own map in
 *  node-format.tsx (online/enrolled/offline/disabled -> success/warning/
 *  muted/destructive) so a mount's health reads the same visual language
 *  as a node's own status. */
export function ObservedStatePill({ state }: { state: NodeServiceRecord["observed_state"] }) {
  const dot: Record<NodeServiceRecord["observed_state"], string> = {
    mounted: "bg-success",
    pending: "bg-warning",
    unmounted: "bg-muted-foreground/50",
    error: "bg-destructive",
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", dot[state])}
        aria-hidden
      />
      <span className="text-foreground capitalize">{state}</span>
    </span>
  );
}

/** config is opaque JSON by design (pkg/nodeservices never interprets it) —
 *  this reads the inference_model shape specifically for display, and
 *  degrades to a raw dump for any other kind or a malformed row rather
 *  than throwing. Shows where the model comes FROM (model_source) — where
 *  it's actually reachable is a different field entirely, see
 *  describeObservedEndpoint below, since config is desired/operator-typed
 *  and the reachable address is reconciler-resolved. */
export function describeNodeServiceConfig(service: NodeServiceRecord): string {
  if (service.kind !== "inference_model") {
    return JSON.stringify(service.config);
  }
  const modelRoute = typeof service.config.model_route === "string" ? service.config.model_route : "?";
  const engine = typeof service.config.engine === "string" ? service.config.engine : "?";
  const source = typeof service.config.model_source === "string" ? service.config.model_source : "";
  return source ? `${modelRoute} (${engine}) — ${source}` : `${modelRoute} (${engine})`;
}

/** The reachable address the reconciler resolved after actually starting
 *  the instance — never operator-typed. "—" until observed_state is
 *  mounted (see pkg/nodeservices.ReportObserved's own contract: the
 *  endpoint is cleared whenever the state isn't mounted, so a stale
 *  address can never outlive the process it described). */
export function describeObservedEndpoint(service: NodeServiceRecord): string {
  return service.observed_endpoint ?? "—";
}
