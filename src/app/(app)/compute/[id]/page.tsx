"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { StatusPill } from "@/components/ui/status";
import { useActiveProject, useEnsureApiKey } from "@/lib/active-project";
import {
  errorMessage,
  useDeleteInstance,
  useInstance,
  useInstanceLogs,
} from "@/lib/api/hooks";
import { formatRate, fullTime } from "@/lib/utils";

export default function InstanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { project } = useActiveProject();
  const { ready } = useEnsureApiKey(project?.id);

  const instance = useInstance(id, ready);
  const remove = useDeleteInstance();
  const [confirming, setConfirming] = useState(false);

  const data = instance.data;

  return (
    <>
      <PageHeader
        breadcrumb={["Projects", project?.name ?? "…", "GPU compute", id]}
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
                  <span className="identifier break-all">{data.image}</span>
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

                {data.endpoint && (
                  <Detail label="Endpoint">
                    <a
                      href={data.endpoint}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground inline-flex items-center gap-1 hover:underline"
                    >
                      <span className="identifier">{data.endpoint}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {data.tls_enabled && !data.tls_ready && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        certificate issuing…
                      </span>
                    )}
                  </Detail>
                )}
              </CardContent>
            </Card>

            <LogsCard id={id} ready={ready} />
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

function LogsCard({ id, ready }: { id: string; ready: boolean }) {
  const logs = useInstanceLogs(id, ready);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logs</CardTitle>
      </CardHeader>
      {/* Monospace, dark-on-dark regardless of theme: logs are terminal
          output and reading them anywhere else is harder, not easier. */}
      <pre className="max-h-96 overflow-auto px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground font-mono">
        {logs.isLoading
          ? "Loading…"
          : logs.isError
            ? errorMessage(logs.error)
            : logs.data?.logs?.trim()
              ? logs.data.logs
              : "No output yet."}
      </pre>
    </Card>
  );
}
