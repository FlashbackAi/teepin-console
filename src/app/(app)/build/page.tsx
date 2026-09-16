"use client";

/**
 * Kumbha's build page — the agent-flow UI. Kumbha itself has no console
 * page of its own (KUMBHA-DESIGN.md): this IS the one first-party surface
 * that talks to it, everything the agent does happens through the same
 * real customer-facing APIs a human uses elsewhere in this console, and
 * infrastructure it creates bills exactly like anything created by hand.
 *
 * This file is the landing/composer state — describe what to build, pick
 * a budget, start. Submitting creates the session and launches the agent
 * in one call (api.createKumbhaSession's `prompt`), then hands off to
 * /build/[id] for the live view.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import KumbhaMark from "@/components/brand/KumbhaMark";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { PaymentGateNotice } from "@/app/(app)/compute/create-shared";
import { useActiveProject } from "@/lib/active-project";
import {
  errorMessage,
  useCanProvision,
  useCreateKumbhaSession,
  useDeleteKumbhaSessions,
  useKumbhaSessions,
} from "@/lib/api/hooks";
import type { KumbhaSession, KumbhaSessionStatus } from "@/lib/api/types";
import { cn, formatCost, fullTime, timeAgo } from "@/lib/utils";

// Every session starts at this fixed budget — asking a customer to pick
// one up front (the removed BUDGET_PRESETS row) meant judging a build's
// cost before it had even started. The live budget meter on the build
// page (budget-meter.tsx) is where a customer raises it instead, once
// there is real spend to judge it against.
const DEFAULT_BUDGET = 5;

// Kumbha's own status vocabulary, distinct from InstanceStatus — StatusPill
// (components/ui/status.tsx) is typed to instance statuses specifically, so
// this is a small local equivalent rather than force-fitting "open"/"closed"
// into a component that means something else.
//
// "open" no longer means "Building" on its own — see SessionStatusPill's
// own comment for why: a session stays open for its entire chat lifetime,
// long after any actual agent work last happened.
const SESSION_STATUS_STYLES: Record<
  KumbhaSessionStatus,
  { dot: string; label: string }
> = {
  open: { dot: "bg-muted-foreground/50", label: "Idle" },
  closed: { dot: "bg-muted-foreground/50", label: "Closed" },
  budget_exhausted: { dot: "bg-warning", label: "Budget exhausted" },
  idle_timeout: { dot: "bg-muted-foreground/50", label: "Timed out" },
};

/**
 * Priority mirrors build/[id]/session-panel.tsx's BuildStatus, minus the
 * live app health check (running vs. terminated): a per-row live cluster
 * read for every session in this list, on every poll, is a cost this
 * table deliberately does not pay (see the backend's own
 * enrichKumbhaAppStatus doc comment) — "Deployed" here just means "has
 * shipped at least once", less specific than the detail page's own
 * status. last_deploy_failed IS cheap here (a stored column, not a live
 * read — see migration 030), so that distinction still shows up.
 *
 *  1. agent_running -> "Building" (an active turn is genuinely underway)
 *  2. else, last_deploy_failed -> "Failed" — ranked above "Deployed"
 *     deliberately: a failed redeploy never touches whatever an earlier
 *     successful deploy already has running, so app_instance_id alone
 *     would still be set and would otherwise hide that the customer's
 *     most recent action here didn't work.
 *  3. else, app_instance_id set -> "Deployed"
 *  4. else -> the session's own lifecycle label (Idle / Closed / Budget
 *     exhausted / Timed out)
 */
function SessionStatusPill({ session }: { session: KumbhaSession }) {
  if (session.agent_running) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="bg-success h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" aria-hidden />
        <span className="text-foreground">Building</span>
      </span>
    );
  }
  if (session.last_deploy_failed) {
    return (
      <span className="inline-flex items-center gap-1.5" title={session.last_deploy_error || undefined}>
        <span className="bg-destructive h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
        <span className="text-foreground">Failed</span>
      </span>
    );
  }
  if (session.app_instance_id) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="bg-success h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
        <span className="text-foreground">Deployed</span>
      </span>
    );
  }
  const style = SESSION_STATUS_STYLES[session.status] ?? SESSION_STATUS_STYLES.closed;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} aria-hidden />
      <span className="text-foreground">{style.label}</span>
    </span>
  );
}

export default function BuildComposerPage() {
  const router = useRouter();
  const { project } = useActiveProject();
  const ready = Boolean(project);
  const canProvision = useCanProvision();
  const create = useCreateKumbhaSession();
  const sessions = useKumbhaSessions(ready);

  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const canSubmit =
    prompt.trim().length > 0 && canProvision !== false && !create.isPending;

  function submit() {
    if (!canSubmit) return;
    const trimmed = prompt.trim();
    create.mutate(
      // The prompt doubles as the session's label — nothing else the
      // customer typed is persisted anywhere else, and "Untitled build"
      // for every row in the history list below would defeat its purpose.
      { budget: DEFAULT_BUDGET, prompt: trimmed, label: trimmed.slice(0, 80) },
      {
        onSuccess: (session) => router.push(`/build/${session.id}`),
      },
    );
  }

  const rows = sessions.data?.sessions ?? [];

  // Every row is selectable, including ones the console shows as
  // "Building" — that status is a stored DB column, not a live read of
  // the agent pod, and found live 2026-08-26 to go stale indefinitely
  // when a pod dies without ever reaching an explicit close. The server
  // is what actually knows whether a pod is still alive
  // (Gateway.DeleteSessions checks live pod status before refusing to
  // delete an "open" session) — this list would otherwise permanently
  // lock a customer out of cleaning up a build whose pod already died.
  const selectedIDs = rows.filter((s) => selected.has(s.id)).map((s) => s.id);
  const allSelected = rows.length > 0 && selectedIDs.length === rows.length;
  const someSelected = selectedIDs.length > 0 && !allSelected;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((s) => s.id)));

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Projects", href: "/projects" },
          project ? { label: project.name, href: "/home" } : "…",
          "Kumbha",
        ]}
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-6 py-16">
        <div className="text-center">
          <div className="bg-muted mx-auto flex h-11 w-11 items-center justify-center rounded-full">
            <KumbhaMark className="text-foreground h-5 w-5" />
          </div>
          <h1 className="text-foreground mt-4 text-xl font-medium">
            What do you want to build?
          </h1>
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm">
            Describe an app in plain language. Kumbha writes it, tests it in
            its own sandbox, and — once you approve the cost — deploys it on
            Teepin&apos;s own infrastructure.
          </p>
        </div>

        <Card className="p-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A booking site for a small dental clinic, with a Postgres-backed appointments table and an admin view…"
            rows={5}
            disabled={create.isPending}
            className="text-foreground placeholder:text-muted-foreground w-full resize-none bg-transparent text-sm focus:outline-none disabled:opacity-50"
          />

          <div className="hairline-t border-border mt-3 flex items-center justify-end pt-3">
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={!canSubmit}
            >
              {create.isPending ? "Starting…" : "Start building"}
            </Button>
          </div>
        </Card>

        {canProvision === false && (
          // No dialog to close here (this is a full page, not a modal) —
          // onClose is a harmless no-op; the link itself still navigates.
          <PaymentGateNotice onClose={() => {}} />
        )}
        {create.isError && (
          <p className="text-destructive text-center text-xs">
            {errorMessage(create.error)}
          </p>
        )}

        <p className="text-muted-foreground text-center text-xs">
          Starts with a {formatCost(DEFAULT_BUDGET)} budget for the
          agent&apos;s own reasoning — raise it from the build page if you
          need more. Whatever infrastructure it creates bills separately,
          at ordinary Teepin rates, only after you review and approve it.
        </p>
      </div>

      {/* Only shown once a history actually exists — an empty "Previous
          builds" heading above a blank state would clutter the first-run
          landing experience for nothing. Read-only: clicking through opens
          /build/[id] to watch/review, not to append a new message to an
          old session (see that page's own doc comment on why continuing a
          finished conversation is separate, unbuilt work). */}
      {rows.length > 0 && (
        <div className="mx-auto max-w-4xl px-6 pb-16">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Previous builds
            </h2>
            {selectedIDs.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleting(true)}
              >
                Delete {selectedIDs.length} selected
              </Button>
            )}
          </div>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH className="w-9 pr-0">
                    <input
                      type="checkbox"
                      aria-label="Select all builds"
                      className="accent-foreground align-middle"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                    />
                  </TH>
                  <TH>Prompt</TH>
                  <TH>Status</TH>
                  <TH>Started</TH>
                  <TH className="text-right">Spent</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((session) => {
                  return (
                    <TR
                      key={session.id}
                      className={selected.has(session.id) ? "bg-muted/50" : undefined}
                    >
                      <TD className="w-9 pr-0">
                        <input
                          type="checkbox"
                          aria-label={`Select ${session.label || "Untitled build"}`}
                          className="accent-foreground align-middle"
                          checked={selected.has(session.id)}
                          onChange={() => toggle(session.id)}
                        />
                      </TD>
                      <TD>
                        <Link
                          href={`/build/${session.id}`}
                          className="text-foreground line-clamp-1 font-medium hover:underline"
                        >
                          {session.label || "Untitled build"}
                        </Link>
                      </TD>
                      <TD>
                        <SessionStatusPill session={session} />
                      </TD>
                      <TD
                        className="text-muted-foreground"
                        title={fullTime(session.started_at)}
                      >
                        {timeAgo(session.started_at)}
                      </TD>
                      <TD className="tabular text-right">
                        {formatCost(session.spent)} / {formatCost(session.budget)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
      {bulkDeleting && (
        <BulkDeleteDialog
          sessions={rows.filter((s) => selected.has(s.id))}
          onClose={(deletedIDs) => {
            setBulkDeleting(false);
            if (deletedIDs.length > 0) {
              setSelected((prev) => {
                const next = new Set(prev);
                for (const id of deletedIDs) next.delete(id);
                return next;
              });
            }
          }}
        />
      )}
      {sessions.isError && (
        <div className="mx-auto max-w-4xl px-6 pb-16">
          <EmptyState
            title="Could not load previous builds"
            description={errorMessage(sessions.error)}
          />
        </div>
      )}
    </>
  );
}

/**
 * One batched call, not one per session — the backend already accepts a
 * list (POST /v1/kumbha/sessions/bulk-delete) and reports back which ids
 * it actually removed vs. skipped. Deleting a still-building session
 * stops it — this confirmation dialog IS the "are you sure," there's no
 * separate stop-first step (2026-08-26) — so in practice "skipped" only
 * ever means the id no longer exists or isn't this account's (e.g. a
 * double-click racing itself), not that it was still building. Deleting
 * only removes the build's own chat/source history — anything it already
 * deployed keeps running, billed exactly as it already was.
 */
function BulkDeleteDialog({
  sessions,
  onClose,
}: {
  sessions: KumbhaSession[];
  onClose: (deletedIDs: string[]) => void;
}) {
  const del = useDeleteKumbhaSessions();
  const [skipped, setSkipped] = useState<number | null>(null);

  const run = () => {
    setSkipped(null);
    del.mutate(sessions.map((s) => s.id), {
      onSuccess: (result) => {
        if (result.skipped.length === 0) {
          onClose(result.deleted);
        } else {
          // Leave the dialog open naming what couldn't be found; caller
          // drops the deleted ones from the selection so a retry only
          // targets the stragglers.
          setSkipped(result.skipped.length);
        }
      },
    });
  };

  const activeCount = sessions.filter((s) => s.status === "open").length;

  return (
    <Dialog
      title={`Delete ${sessions.length} ${sessions.length === 1 ? "build" : "builds"}`}
      description={
        activeCount > 0
          ? `${activeCount} of these ${activeCount === 1 ? "is" : "are"} still building — deleting will stop ${activeCount === 1 ? "it" : "them"}. This removes the build's chat and source history; anything it already deployed keeps running and billing normally.`
          : "This removes the build's chat and source history. Anything it already deployed keeps running and billing normally."
      }
      onClose={() => onClose([])}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onClose([])}>
            {skipped === null ? "Cancel" : "Close"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={del.isPending}
            onClick={run}
          >
            {del.isPending
              ? "Deleting…"
              : skipped === null
                ? `Delete ${sessions.length} ${sessions.length === 1 ? "build" : "builds"}`
                : "Retry remaining"}
          </Button>
        </>
      }
    >
      {del.isError && (
        <p className="text-destructive text-xs">{errorMessage(del.error)}</p>
      )}
      {skipped !== null && (
        <p className="text-muted-foreground text-xs">
          {skipped} {skipped === 1 ? "build" : "builds"} could not be found —
          the rest were removed.
        </p>
      )}
    </Dialog>
  );
}
