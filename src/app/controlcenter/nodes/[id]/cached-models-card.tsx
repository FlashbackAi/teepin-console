"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
import { formatBytes } from "@/lib/utils";

/**
 * Models downloaded onto this node's disk, with a delete action for the ones
 * no mount uses. The agent reports its model cache with each inventory, so
 * this shows what is actually occupying disk — including models no mount
 * refers to any more (a failed experiment's 20GB download, say).
 */
export function CachedModelsCard({ nodeId }: { nodeId: string }) {
  const queryClient = useQueryClient();
  const key = ["admin", "node-cached-models", nodeId];

  const cached = useQuery({
    queryKey: key,
    queryFn: () => admin.listNodeCachedModels(nodeId),
    retry: false,
    refetchInterval: 30_000,
  });

  const del = useMutation({
    mutationFn: (repoId: string) => admin.deleteNodeCachedModel(nodeId, repoId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) => alert(errorMessage(e)),
  });

  const models = cached.data?.models ?? [];
  const total = models.reduce((sum, m) => sum + m.size_bytes, 0);
  const notAvailable =
    cached.error instanceof ApiError && cached.error.status === 404;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Downloaded models</CardTitle>
        {models.length > 0 && (
          <span className="tabular text-muted-foreground text-xs">
            {formatBytes(total)} on disk
          </span>
        )}
      </CardHeader>

      {cached.isLoading ? (
        <Loading className="px-4 py-10" />
      ) : cached.isError ? (
        <div className="text-muted-foreground px-4 py-6 text-sm">
          {notAvailable
            ? "Model cache management is not available on this control plane."
            : errorMessage(cached.error)}
        </div>
      ) : !cached.data?.online ? (
        <div className="text-muted-foreground px-4 py-6 text-sm">
          The node&apos;s agent is offline, so its disk cannot be listed right
          now.
        </div>
      ) : !cached.data.known ? (
        <div className="text-muted-foreground px-4 py-6 text-sm">
          This node does not report a model cache (it runs no native models, or
          its agent is older than this feature).
        </div>
      ) : !models.length ? (
        <EmptyState
          title="Nothing downloaded"
          description="No model files are stored on this node."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Model</TH>
              <TH>Size</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {models.map((m) => (
              <TR key={m.repo_id}>
                <TD className="identifier text-foreground">{m.repo_id}</TD>
                <TD className="tabular text-muted-foreground">
                  {formatBytes(m.size_bytes)}
                </TD>
                <TD className="text-muted-foreground">
                  {m.in_use ? "In use by a mount" : "Unused"}
                </TD>
                <TD className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={m.in_use || del.isPending}
                    title={m.in_use ? "Unmount it first" : undefined}
                    onClick={() => {
                      if (
                        confirm(
                          `Delete "${m.repo_id}" (${formatBytes(m.size_bytes)}) from this node's disk? It will be downloaded again if you mount it later.`,
                        )
                      ) {
                        del.mutate(m.repo_id);
                      }
                    }}
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
  );
}
