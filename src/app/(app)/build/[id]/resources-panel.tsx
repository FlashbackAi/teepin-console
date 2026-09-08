"use client";

/**
 * Every compute instance this Kumbha session has ever created — deploy's
 * own tracked "app" instance, plus anything a raw create_instance call
 * produced, which historically left no trace on the session at all.
 *
 * Found live 2026-08-30/31: the `deploy` endpoint was erroring, so the
 * agent fell back to create_instance directly — twice, once with a
 * broken boot script and once fixed — and NEITHER instance was ever
 * recorded against the session. Both kept running and billing, invisible
 * to this page, until the customer noticed the extra usage. Migration 032
 * + the backend's new GET /sessions/:id/instances close the tracking gap;
 * this panel is what makes the result visible and cleanable, rather than
 * just present in a database column nobody looks at.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusPill } from "@/components/ui/status";
import {
  errorMessage,
  useDeleteInstance,
  useKumbhaSessionInstances,
} from "@/lib/api/hooks";

export function ResourcesPanel({ sessionId }: { sessionId: string }) {
  const { data } = useKumbhaSessionInstances(sessionId, Boolean(sessionId));
  const [expanded, setExpanded] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const deleteInstance = useDeleteInstance();
  // useDeleteInstance only invalidates the plain Compute page's own
  // queries — it has no idea this session-scoped list exists. Invalidated
  // separately here rather than teaching the shared hook about Kumbha.
  const queryClient = useQueryClient();

  const instances = data?.instances ?? [];
  // Nothing has ever been created — the common case for a session still
  // mid-conversation, before any deploy — so there's nothing worth a row
  // for yet.
  if (instances.length === 0) return null;

  return (
    <div className="hairline-b border-border px-4 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Resources ({instances.length})
      </button>

      {expanded && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {instances.map((inst) => (
            <li
              key={inst.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <StatusPill status={inst.status} />
                <span className="text-foreground truncate" title={inst.id}>
                  {inst.name || inst.id}
                </span>
                {inst.is_app && (
                  <span className="text-muted-foreground shrink-0">· app</span>
                )}
              </span>
              {inst.status !== "terminated" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  title="Delete this instance"
                  onClick={() => setPendingDeleteId(inst.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {pendingDeleteId && (
        <Dialog
          title="Delete instance"
          description="Permanently stops and removes this instance — it stops billing immediately. This can't be undone."
          onClose={() => setPendingDeleteId(null)}
          footer={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingDeleteId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteInstance.isPending}
                onClick={() =>
                  deleteInstance.mutate(pendingDeleteId, {
                    onSuccess: () => {
                      queryClient.invalidateQueries({
                        queryKey: ["kumbha-session-instances", sessionId],
                      });
                      setPendingDeleteId(null);
                    },
                  })
                }
              >
                {deleteInstance.isPending ? "Deleting…" : "Delete"}
              </Button>
            </>
          }
        >
          {deleteInstance.isError && (
            <p className="text-destructive text-xs">
              {errorMessage(deleteInstance.error)}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
