"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loading } from "@/components/ui/loading";
import { StatusPill } from "@/components/ui/status";
import {
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shell/page-header";
import { CreateCPUInstanceDialog } from "../create-cpu-dialog";
import { useActiveProject } from "@/lib/active-project";
import { errorMessage, useInstances } from "@/lib/api/hooks";
import { formatRate, fullTime, timeAgo } from "@/lib/utils";

/**
 * CPU compute (home nodes).
 *
 * The instance store is shared with GPU compute — this page filters to CPU
 * instances (non-GPU instance types). Same list/detail components; only the
 * create flow and the filter differ.
 */
export default function CPUComputePage() {
  const { project } = useActiveProject();
  const ready = Boolean(project);
  const instances = useInstances(ready);
  const [creating, setCreating] = useState(false);

  // A CPU instance has no GPU VRAM; its type is a cpu.* tier (or unset for a
  // bare CPU workload). GPU instances are gpu.* — exclude those.
  const rows = (instances.data?.instances ?? []).filter(
    (i) => !(i.instance_type ?? "").startsWith("gpu"),
  );

  return (
    <>
      <PageHeader
        breadcrumb={["Projects", project?.name ?? "…", "CPU compute"]}
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreating(true)}
            disabled={!ready}
          >
            Create instance
          </Button>
        }
      />

      <div className="p-6">
        <Card>
          {instances.isLoading || !ready ? (
            <Loading className="px-4 py-16" />
          ) : instances.isError ? (
            <EmptyState
              title="Cannot reach compute capacity"
              description={errorMessage(instances.error)}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => instances.refetch()}
                >
                  Retry
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No CPU instances"
              description="Run a container on consumer-grade CPU capacity. Billed per vCPU + memory per hour, only while it runs."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCreating(true)}
                >
                  Create instance
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>ID</TH>
                  <TH>Status</TH>
                  <TH>Type</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Rate</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((instance) => (
                  <TR key={instance.id}>
                    <TD>
                      <Link
                        href={`/compute/${instance.id}`}
                        className="text-foreground font-medium hover:underline"
                      >
                        {instance.name || instance.id}
                      </Link>
                    </TD>
                    <TD>
                      <span className="identifier text-muted-foreground">
                        {instance.id}
                      </span>
                    </TD>
                    <TD>
                      <StatusPill
                        status={instance.status}
                        message={instance.status_message}
                      />
                    </TD>
                    <TD className="text-muted-foreground">
                      {instance.instance_type ?? "—"}
                    </TD>
                    <TD
                      className="text-muted-foreground"
                      title={fullTime(instance.created_at)}
                    >
                      {timeAgo(instance.created_at)}
                    </TD>
                    <TD className="tabular text-right">
                      {instance.price_per_hour
                        ? formatRate(instance.price_per_hour)
                        : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {creating && (
        <CreateCPUInstanceDialog onClose={() => setCreating(false)} />
      )}
    </>
  );
}
