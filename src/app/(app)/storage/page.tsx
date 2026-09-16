"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
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
import { PageHeader } from "@/components/shell/page-header";
import { CreateBucketDialog } from "./create-bucket-dialog";
import { useActiveProject } from "@/lib/active-project";
import { errorMessage, useBuckets, useDeleteBucket } from "@/lib/api/hooks";
import { formatBytes, fullTime, timeAgo } from "@/lib/utils";

export default function StoragePage() {
  const { project } = useActiveProject();
  const ready = Boolean(project);
  const buckets = useBuckets(ready);
  const deleteBucket = useDeleteBucket();
  const [creating, setCreating] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const rows = buckets.data?.buckets ?? [];

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Projects", href: "/projects" },
          project ? { label: project.name, href: "/home" } : "…",
          "Storage",
        ]}
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreating(true)}
            disabled={!ready}
          >
            Create bucket
          </Button>
        }
      />

      <div className="p-6">
        <Card>
          {buckets.isLoading || !ready ? (
            <Loading className="px-4 py-16" />
          ) : buckets.isError ? (
            // Never show "no buckets" for a failed query — the customer's
            // buckets exist and may be billed for storage, same reasoning
            // as ComputePage's identical guard.
            <EmptyState
              title="Cannot reach storage"
              description={errorMessage(buckets.error)}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => buckets.refetch()}
                >
                  Retry
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No buckets"
              description="Create a bucket to start storing objects. You are billed per GB stored and transferred."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCreating(true)}
                >
                  Create bucket
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Backend</TH>
                  <TH className="text-right">Objects</TH>
                  <TH className="text-right">Size</TH>
                  <TH>Created</TH>
                  <TH className="w-16" />
                </TR>
              </THead>
              <TBody>
                {rows.map((bucket) => (
                  <TR key={bucket.id}>
                    <TD>
                      <Link
                        href={`/storage/${encodeURIComponent(bucket.name)}`}
                        className="text-foreground font-medium hover:underline"
                      >
                        {bucket.name}
                      </Link>
                    </TD>
                    <TD className="text-muted-foreground">{bucket.backend}</TD>
                    <TD className="tabular text-right">{bucket.object_count}</TD>
                    <TD className="tabular text-right">
                      {formatBytes(bucket.total_bytes)}
                    </TD>
                    <TD
                      className="text-muted-foreground"
                      title={fullTime(bucket.created_at)}
                    >
                      {timeAgo(bucket.created_at)}
                    </TD>
                    <TD className="w-16 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingName(bucket.name)}
                      >
                        Delete
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {creating && <CreateBucketDialog onClose={() => setCreating(false)} />}

      {deletingName && (
        <Dialog
          title="Delete bucket"
          description="A bucket can only be deleted once it's empty."
          onClose={() => {
            setDeletingName(null);
            deleteBucket.reset();
          }}
          footer={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeletingName(null);
                  deleteBucket.reset();
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteBucket.isPending}
                onClick={() =>
                  deleteBucket.mutate(deletingName, {
                    onSuccess: () => setDeletingName(null),
                  })
                }
              >
                {deleteBucket.isPending ? "Deleting…" : "Delete bucket"}
              </Button>
            </>
          }
        >
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground">{deletingName}</span> will be
            permanently deleted.
          </p>
          {deleteBucket.isError && (
            <p className="text-destructive mt-3 text-xs">
              {errorMessage(deleteBucket.error)}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
