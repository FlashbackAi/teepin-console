"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { useAnnounceComputeSection } from "@/components/shell/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { StatusPill } from "@/components/ui/status";
import { Tabs } from "@/components/ui/tabs";
import { useActiveProject } from "@/lib/active-project";
import {
  errorMessage,
  useDeleteInstance,
  useInstance,
} from "@/lib/api/hooks";
import { formatImageForDisplay, formatRate, fullTime } from "@/lib/utils";
import { LogsCard } from "./logs-card";
import { MetricsCard } from "./metrics-card";

// xterm touches `window` at import time — ssr:false keeps this file out
// of any server-rendered chunk entirely, not just deferred.
const TerminalCard = dynamic(() => import("./terminal-card"), { ssr: false });

export default function InstanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { project } = useActiveProject();
  const ready = Boolean(project);

  const instance = useInstance(id, ready);
  const remove = useDeleteInstance();
  const [confirming, setConfirming] = useState(false);
  const [tab, setTab] = useState<"metrics" | "logs" | "terminal">("logs");

  const data = instance.data;

  // Which section this instance belongs to — a cpu.home instance reached
  // via CPU compute must not claim to be under GPU compute, in either the
  // breadcrumb or the sidebar highlight. Same gpu.* convention used by the
  // list pages and the sidebar's running-count split. null while the
  // instance is still loading, since the type isn't known yet.
  const section: "gpu" | "cpu" | null = !data
    ? null
    : (data.instance_type ?? "").startsWith("gpu")
      ? "gpu"
      : "cpu";
  // Tell the sidebar which link to highlight — GPU and CPU instance detail
  // share one URL shape, so the sidebar can't infer this from the path
  // alone. Cleared automatically on unmount (see the hook).
  useAnnounceComputeSection(section);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Projects", href: "/projects" },
          project ? { label: project.name, href: "/home" } : "…",
          section === "gpu"
            ? { label: "GPU compute", href: "/compute" }
            : section === "cpu"
              ? { label: "CPU compute", href: "/compute/cpu" }
              : "Compute",
          id,
        ]}
        action={
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={!data || data.status === "terminated"}
          >
            Delete
          </Button>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        {instance.isError && (
          <Card className="px-4 py-3">
            <p className="text-muted-foreground text-sm">
              {errorMessage(instance.error)}
            </p>
          </Card>
        )}

        {data && (
          <>
            {/* The allocation note appears when the platform reserved
                MORE than requested because no exact slice fit. It is a
                billing surprise, so it gets its own prominent block
                rather than a footnote. */}
            {data.allocation_note && (
              <Card className="border-warning/40 bg-warning/5 px-4 py-3">
                <p className="text-foreground text-sm">
                  {data.allocation_note}
                </p>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>{data.name || data.id}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-3">
                <Detail label="Status">
                  <StatusPill
                    status={data.status}
                    message={data.status_message}
                  />
                </Detail>
                <Detail label="Instance ID">
                  <span className="identifier">{data.id}</span>
                </Detail>
                <Detail label="Type">{data.instance_type ?? "—"}</Detail>
                <Detail label="Image">
                  <span className="identifier break-all" title={data.image}>
                    {formatImageForDisplay(data.image)}
                  </span>
                </Detail>
                <Detail label="GPU memory">
                  {data.allocated_vram ?? "—"}
                </Detail>
                <Detail label="Rate">
                  <span className="tabular">
                    {data.price_per_hour
                      ? formatRate(data.price_per_hour)
                      : "—"}
                  </span>
                </Detail>
                <Detail label="vCPUs">{data.cpu_units}</Detail>
                <Detail label="Memory">{data.memory}</Detail>
                <Detail label="Created">{fullTime(data.created_at)}</Detail>

                <Detail label="Endpoint">
                  {(() => {
                    // The backend now self-heals this (see
                    // statusToInstance's derivation fallback), so
                    // data.endpoint should already be populated for any
                    // instance with a port — dns_name is a defensive
                    // fallback for an edge case the backend fix doesn't
                    // cover, not the primary path.
                    const url = data.endpoint || (data.dns_name ? `https://${data.dns_name}` : "");
                    if (!url) {
                      return (
                        <span className="text-muted-foreground">
                          No public endpoint — no ports exposed
                        </span>
                      );
                    }
                    return (
                      <>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground inline-flex items-center gap-1 hover:underline"
                        >
                          <span className="identifier">{url}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {data.tls_enabled && !data.tls_ready && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            certificate issuing…
                          </span>
                        )}
                      </>
                    );
                  })()}
                </Detail>
                {data.storage_gb ? (
                  <Detail label="Storage">
                    {data.storage_gb}GB persistent volume
                  </Detail>
                ) : null}
              </CardContent>
            </Card>

            {/* Tabs carries its own px-6 for page-level use (see billing/
                projects pages, where it sits directly under PageHeader
                with no wrapping padding) — this instance is nested
                inside the p-6 content column above, so -mx-6 cancels
                that padding back out to keep the tab labels aligned
                with the cards around them. */}
            <div className="-mx-6">
              <Tabs
                tabs={[
                  { id: "metrics", label: "Metrics" },
                  { id: "logs", label: "Logs" },
                  { id: "terminal", label: "Terminal" },
                ]}
                active={tab}
                onChange={(next) =>
                  setTab(next as "metrics" | "logs" | "terminal")
                }
              />
            </div>
            {/* All three panels stay mounted always (CSS `hidden`, not a
                ternary) so switching tabs no longer tears down the
                terminal's live WebSocket or its scrollback — previously
                a real bug: leaving the Terminal tab unmounted it,
                closing the session, per terminal-card.tsx's own unmount
                cleanup effect. `active` lets each panel pause its own
                background work (log polling, resize fitting, metrics
                polling) while hidden, without losing state. */}
            <div className={tab === "metrics" ? undefined : "hidden"}>
              <MetricsCard id={id} active={tab === "metrics"} />
            </div>
            <div className={tab === "logs" ? undefined : "hidden"}>
              <LogsCard id={id} ready={ready} active={tab === "logs"} />
            </div>
            <div className={tab === "terminal" ? undefined : "hidden"}>
              <TerminalCard id={id} active={tab === "terminal"} />
            </div>
          </>
        )}
      </div>

      {confirming && data && (
        <Dialog
          title="Delete instance"
          description="The container stops immediately and billing ends. This cannot be undone."
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(id, {
                    onSuccess: () => router.push("/compute"),
                  })
                }
              >
                {remove.isPending ? "Deleting…" : "Delete instance"}
              </Button>
            </>
          }
        >
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground">{data.name || data.id}</span>{" "}
            will be destroyed. Any data not written to persistent storage is
            lost.
          </p>
          {remove.isError && (
            <p className="text-destructive mt-3 text-xs">
              {errorMessage(remove.error)}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-foreground text-sm">{children}</span>
    </div>
  );
}

