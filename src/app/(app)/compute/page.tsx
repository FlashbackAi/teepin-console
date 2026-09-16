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
import { CreateInstanceDialog } from "./create-dialog";
import { useActiveProject } from "@/lib/active-project";
import { errorMessage, useInstances } from "@/lib/api/hooks";
import { formatRate, fullTime, timeAgo } from "@/lib/utils";

export default function ComputePage() {
  const { project } = useActiveProject();
  const ready = Boolean(project);
  const instances = useInstances(ready);
  const [creating, setCreating] = useState(false);

  // GPU instances only — CPU (home) instances live on /compute/cpu. A GPU
  // instance's type is gpu.*; anything else is filtered out here.
  const rows = (instances.data?.instances ?? []).filter((i) =>
    (i.instance_type ?? "").startsWith("gpu"),
  );

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Projects", href: "/projects" },
          project ? { label: project.name, href: "/home" } : "…",
          "GPU compute",
        ]}
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
            /* NEVER show "no instances" for a failed query. The customer's
               instances are running and being billed; saying they do not
               exist is the single most alarming thing this page could get
               wrong. */
            <EmptyState
              title="Cannot reach GPU capacity"
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
              title="No instances"
              description="Deploy a container on a GPU. You are billed per GB of VRAM per hour, only while it runs."
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
        <CreateInstanceDialog onClose={() => setCreating(false)} />
      )}
    </>
  );
}
