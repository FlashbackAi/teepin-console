"use client";

/**
 * The IDE's rollback control — every version that has ACTUALLY been
 * deployed at some point, newest first, with the currently-live one
 * badged. An in-progress draft (agent OR customer — both now save the
 * same way, see pkg/kumbha/workspace.go's SaveVersion) never appears
 * here; a new entry only lands once CheckpointCurrentVersion marks it at
 * a real successful deploy. Found live 2026-08-31: History used to show
 * a new entry on every customer save regardless of whether it was ever
 * deployed, and badged whichever version the customer happened to be
 * VIEWING ("Current") rather than what was actually LIVE — the "Deployed"
 * badge below (is_deployed, driven by last_deployed_version) is what
 * fixed that. Rolling back only moves the DRAFT pointer
 * (current_workspace_version, see SetCurrentVersion) — what the file
 * browser shows and Deploy would act on next — not what's live; nothing
 * is deleted, so a rollback can itself be undone by rolling forward
 * again, which is why the dialog stays open after one rather than
 * closing on first click.
 */

import { Code2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Loading } from "@/components/ui/loading";
import {
  errorMessage,
  useKumbhaWorkspaceVersions,
  useRollbackKumbhaWorkspace,
} from "@/lib/api/hooks";
import { timeAgo } from "@/lib/utils";
import { formatBytes } from "./format-bytes";

export function VersionHistoryDialog({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const versions = useKumbhaWorkspaceVersions(sessionId);
  const rollback = useRollbackKumbhaWorkspace(sessionId);

  return (
    <Dialog title="Version history" onClose={onClose} className="max-w-lg">
      {versions.isLoading ? (
        <Loading className="py-8" size={48} />
      ) : versions.isError ? (
        <p className="text-destructive text-xs">{errorMessage(versions.error)}</p>
      ) : !versions.data?.versions?.length ? (
        <p className="text-muted-foreground text-sm">
          Nothing here yet — a version appears once your first deploy
          succeeds.
        </p>
      ) : (
        <ul className="-mx-1 max-h-96 space-y-1 overflow-y-auto">
          {versions.data.versions.map((v) => (
            <li
              key={v.version}
              className="hairline flex items-center justify-between gap-3 rounded-md border-border px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                {v.created_by === "agent" ? (
                  <Code2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                ) : (
                  <User className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground text-sm font-medium">
                      Version {v.version}
                    </span>
                    {v.is_deployed && (
                      <span className="bg-success/15 text-success rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                        Deployed
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {v.created_by === "agent" ? "Agent" : "You"} ·{" "}
                    {timeAgo(v.created_at)} · {v.file_count} files ·{" "}
                    {formatBytes(v.byte_size)}
                  </p>
                </div>
              </div>
              {!v.current && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rollback.isPending}
                  onClick={() => rollback.mutate(v.version)}
                >
                  {rollback.isPending && rollback.variables === v.version
                    ? "Rolling back…"
                    : "Roll back"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {rollback.isError && (
        <p className="text-destructive mt-2 text-xs">
          {errorMessage(rollback.error)}
        </p>
      )}
    </Dialog>
  );
}
