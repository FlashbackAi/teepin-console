"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { KumbhaCandidateView, KumbhaRouteView } from "@/lib/api/types";
import { cn, fullTime, timeAgo } from "@/lib/utils";
import { CandidateDialog } from "./candidate-dialog";

/**
 * Kumbha's configured routes ("teepin/fast", "teepin/deep"): which backend
 * each one uses is never shown to a customer (KUMBHA-DESIGN.md — "no console
 * page of its own"), but an operator deciding whether to turn one on, or
 * move build sessions to a demo-ready backend, needs exactly that.
 *
 * A route's candidates (its ranked, live-editable backends) are shown here
 * too when this deployment has any configured — base URL, model, priority,
 * enabled state, and per-candidate health, all editable with no redeploy
 * (see pkg/kumbha/candidates.go). A route with no candidates still shows —
 * it's using its static, env-var-configured backend, unaffected by any of
 * this. "Add a route" registers a brand-new one purely from here.
 */
export default function ControlCenterKumbhaPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<
    { route: string; candidate?: KumbhaCandidateView } | null
  >(null);

  const routes = useQuery({
    queryKey: ["admin", "kumbha-routes"],
    queryFn: admin.listKumbhaRoutes,
    retry: false,
    refetchInterval: 30_000, // health can change between visits; keep it live
  });
  const routeList = routes.data?.routes ?? [];
  const notAvailable =
    routes.error instanceof ApiError && routes.error.status === 404;

  const setEnabled = useMutation({
    mutationFn: ({ route, enabled }: { route: string; enabled: boolean }) =>
      admin.setKumbhaRouteEnabled(route, enabled),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "kumbha-routes"] }),
    onError: (e) => alert(errorMessage(e)),
  });

  const deleteCandidate = useMutation({
    mutationFn: (id: string) => admin.deleteKumbhaCandidate(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "kumbha-routes"] }),
    onError: (e) => alert(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Control centre", href: "/controlcenter" },
          "Kumbha",
        ]}
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing({ route: "" })}
          >
            Add route
          </Button>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        {routes.isLoading ? (
          <Loading className="px-4 py-16" />
        ) : notAvailable ? (
          <Card>
            <div className="text-muted-foreground px-4 py-6 text-sm">
              Kumbha is not available on this control plane.
            </div>
          </Card>
        ) : routes.isError ? (
          <Card>
            <div className="text-muted-foreground px-4 py-6 text-sm">
              {errorMessage(routes.error)}
            </div>
          </Card>
        ) : !routeList.length ? (
          <Card>
            <EmptyState
              title="No routes configured"
              description="A route appears here once its backend is wired in (TEEPIN_VLLM_BASE_URL, TEEPIN_ANTHROPIC_MODEL), or added directly with Add route."
            />
          </Card>
        ) : (
          routeList.map((route) => (
            <RouteCard
              key={route.name}
              route={route}
              onToggleEnabled={() =>
                setEnabled.mutate({ route: route.name, enabled: !route.enabled })
              }
              toggling={setEnabled.isPending}
              onAddCandidate={() => setEditing({ route: route.name })}
              onEditCandidate={(candidate) =>
                setEditing({ route: route.name, candidate })
              }
              onDeleteCandidate={(candidate) => {
                if (
                  confirm(
                    `Remove this backend (${candidate.model}) from ${route.name}? Its stored API key, if any, is deleted too.`,
                  )
                ) {
                  deleteCandidate.mutate(candidate.id);
                }
              }}
            />
          ))
        )}
      </div>

      {editing && (
        <CandidateDialog
          routeName={editing.route}
          candidate={editing.candidate}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function RouteCard({
  route,
  onToggleEnabled,
  toggling,
  onAddCandidate,
  onEditCandidate,
  onDeleteCandidate,
}: {
  route: KumbhaRouteView;
  onToggleEnabled: () => void;
  toggling: boolean;
  onAddCandidate: () => void;
  onEditCandidate: (c: KumbhaCandidateView) => void;
  onDeleteCandidate: (c: KumbhaCandidateView) => void;
}) {
  const candidates = route.candidates ?? [];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="identifier">{route.name}</CardTitle>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  route.enabled ? "bg-success" : "bg-muted-foreground/50",
                )}
                aria-hidden
              />
              <span className="text-muted-foreground text-xs">
                {route.enabled ? "Enabled" : "Disabled"}
              </span>
            </span>
            {!candidates.length && (
              <HealthPill health={route.health} error={route.health_error} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onAddCandidate}>
              Add backend
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={toggling}
              onClick={onToggleEnabled}
            >
              {route.enabled ? "Disable route" : "Enable route"}
            </Button>
          </div>
        </div>
      </CardHeader>

      {!candidates.length ? (
        <div className="text-muted-foreground px-4 py-4 text-sm">
          Using its static, env-var-configured backend.{" "}
          {route.checked_at && (
            <span title={fullTime(route.checked_at)}>
              Last checked {timeAgo(route.checked_at)}.
            </span>
          )}{" "}
          Add a backend to make this route&rsquo;s config, priority, and API
          key editable here with no redeploy.
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Priority</TH>
              <TH>Provider</TH>
              <TH>Model</TH>
              <TH>Status</TH>
              <TH>Health</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {[...candidates]
              .sort((a, b) => a.priority - b.priority)
              .map((c) => (
                <TR key={c.id}>
                  <TD className="tabular">{c.priority}</TD>
                  <TD>
                    {c.provider_type}
                    {c.has_secret && (
                      <span
                        className="text-muted-foreground ml-1.5 text-xs"
                        title="An API key is set for this backend"
                      >
                        🔑
                      </span>
                    )}
                  </TD>
                  <TD className="identifier">{c.model}</TD>
                  <TD>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                          c.enabled ? "bg-success" : "bg-muted-foreground/50",
                        )}
                        aria-hidden
                      />
                      <span className="text-foreground">
                        {c.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </span>
                  </TD>
                  <TD>
                    <HealthPill health={c.health} error={c.health_error} />
                  </TD>
                  <TD className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditCandidate(c)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="ml-1.5"
                      onClick={() => onDeleteCandidate(c)}
                    >
                      Remove
                    </Button>
                  </TD>
                </TR>
              ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function HealthPill({
  health,
  error,
}: {
  health: "unknown" | "healthy" | "unhealthy";
  error?: string;
}) {
  const label =
    health === "healthy"
      ? "Healthy"
      : health === "unhealthy"
        ? "Unhealthy"
        : "Unknown";
  const dot =
    health === "healthy"
      ? "bg-success"
      : health === "unhealthy"
        ? "bg-destructive"
        : "bg-muted-foreground/50";
  return (
    <span className="inline-flex items-center gap-1.5" title={error}>
      <span
        className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", dot)}
        aria-hidden
      />
      <span className="text-foreground">{label}</span>
      {health === "unhealthy" && error && (
        <span className="text-destructive text-xs">({error})</span>
      )}
    </span>
  );
}
