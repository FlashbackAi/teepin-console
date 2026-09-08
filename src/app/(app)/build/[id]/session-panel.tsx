"use client";

/**
 * The live activity feed — the "watch it work" surface KUMBHA-DESIGN.md's
 * process-transparency correction exists for. Nearly every action the
 * agent takes is shown here in real time (file_editor is the one
 * exception — see ActivityFeed's visibleEvents — since the agent calls it
 * for almost every source change and rendering all of it drowned out
 * everything else); which backend model served a step is structurally
 * never present (pkg/kumbha/events.go's server-side allowlist), so there
 * is nothing to hide client-side either.
 */

import { memo, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  PauseCircle,
  SquareTerminal,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status";
import { errorMessage, useSendKumbhaMessage } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";
import type { KumbhaEvent, KumbhaSession } from "@/lib/api/types";
import { BudgetMeter } from "./budget-meter";
import { ResourcesPanel } from "./resources-panel";

const EVENT_ICON: Record<
  KumbhaEvent["type"],
  React.ComponentType<{ className?: string }>
> = {
  action: Wrench,
  observation: CheckCircle2,
  message: MessageSquare,
  error: AlertTriangle,
  idle: PauseCircle,
};

const STATUS_LABEL: Record<KumbhaSession["status"], string> = {
  open: "open",
  closed: "closed",
  budget_exhausted: "ran out of budget",
  idle_timeout: "timed out",
};

export function SessionPanel({
  session,
  events,
  connection,
  hasPlan,
  onReviewPlan,
}: {
  session: KumbhaSession;
  events: KumbhaEvent[];
  connection: "connecting" | "connected" | "ended";
  hasPlan: boolean;
  onReviewPlan: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="hairline-b border-border flex flex-col gap-3 px-4 py-3">
        <BudgetMeter session={session} />
        <div className="flex items-center justify-between gap-2">
          <BuildStatus
            session={session}
            connection={connection}
            latestEventType={events.at(-1)?.type}
          />
          {hasPlan && (
            <Button variant="ghost" size="sm" onClick={onReviewPlan}>
              Review deployment plan
            </Button>
          )}
        </div>
      </div>

      <ResourcesPanel sessionId={session.id} />

      <ActivityFeed events={events} connection={connection} />

      {session.status === "open" && <ChatInput sessionId={session.id} />}
    </div>
  );
}

/**
 * "Chat + resume" — a follow-up instruction after the session's initial
 * prompt. What happens to it is server-side (Gateway.DeliverMessage): if
 * the agent pod is still alive it's queued for the SAME conversation
 * (full history intact); if not, a fresh pod is launched with it as the
 * new prompt. Either way, the actual reaction shows up in the activity
 * feed above, not in this component — this only reports whether the
 * SEND itself succeeded, and (briefly) whether it triggered a relaunch,
 * since a relaunch means a longer-than-usual wait before anything new
 * appears above.
 */
function ChatInput({ sessionId }: { sessionId: string }) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const send = useSendKumbhaMessage(sessionId);

  function submit() {
    const content = value.trim();
    if (!content || send.isPending) return;
    send.mutate(content, {
      onSuccess: (result) => {
        setValue("");
        setNotice(
          result.relaunched
            ? "The previous run had ended — restarting the agent with your message. This may take a little longer than usual."
            : null,
        );
      },
    });
  }

  return (
    <div className="hairline-t border-border shrink-0 px-4 py-3">
      {notice && (
        <p className="text-muted-foreground mb-2 text-xs">{notice}</p>
      )}
      {send.isError && (
        <p className="text-destructive mb-2 text-xs">{errorMessage(send.error)}</p>
      )}
      <div className="hairline border-border flex items-end gap-2 rounded-md px-2.5 py-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask for a change or send the next instruction…"
          rows={1}
          disabled={send.isPending}
          className="text-foreground placeholder:text-muted-foreground max-h-32 min-h-[1.5rem] flex-1 resize-none bg-transparent text-sm outline-none disabled:opacity-50"
        />
        <Button
          variant="primary"
          size="icon"
          disabled={!value.trim() || send.isPending}
          onClick={submit}
          title="Send"
        >
          {send.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUp className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * The one headline status for this build — deliberately answers "what
 * state is this in RIGHT NOW" with a single label, not two competing
 * ones. Priority order, most specific/actionable first:
 *
 *  1. agent_running (live) AND the latest activity-feed event is not
 *     "idle" -> "Building" — an active development turn is genuinely in
 *     progress. This is the ONLY case that should ever read "Building":
 *     found live 2026-08-29, a session with a long-finished agent pod
 *     still showed "Building" indefinitely because the old logic only
 *     ever looked at session.status ("open"), which stays open for the
 *     whole chat lifetime, long after any actual work last happened.
 *
 *     A second, narrower version of the same bug found live 2026-08-31:
 *     agent_running alone (isAgentRunning in pkg/kumbha/agent.go) only
 *     ever checks whether the pod PROCESS is alive — true for the entire
 *     30-minute idle window run.py's wait_for_next_instruction sits in
 *     between turns, waiting for the next chat message. The pod being
 *     alive is necessary for "Building" but not sufficient: the agent
 *     itself already emits an explicit `{"type":"idle"}` event the
 *     instant it enters that wait (run.py, "Waiting for the next
 *     instruction" — visible in the activity feed below this pill), so
 *     the most recent event's type is the correct tie-breaker between
 *     "still alive, but idle" and "actually working" — cheaper and more
 *     precise than adding a second live-poll signal.
 *  2. Not building, but the LATEST build/deploy attempt failed
 *     (last_deploy_failed) -> "Last deploy failed", ranked above the
 *     app's own live status deliberately: a failed redeploy never
 *     touches whatever an earlier successful deploy already has running
 *     (see migration 030's own doc comment), so app_status alone would
 *     keep showing "Running" for the OLD instance with no sign the
 *     customer's most recent action didn't work.
 *  3. Not building, last attempt fine, but something has been deployed
 *     -> the APP's own live status (StatusPill, compute's own
 *     vocabulary — reused as-is rather than inventing a second taxonomy
 *     for the same pod), e.g. "Running" or "Terminated", with its own
 *     message surfaced the same way the Compute page already does.
 *  4. Nothing deployed yet, session no longer open -> its terminal
 *     lifecycle reason (ran out of budget / timed out) — "closed" no
 *     longer happens on its own; see StopKumbhaAgent's own doc comment
 *     on why there is no more customer-facing close action.
 *  5. Nothing deployed yet, session still open, agent idle -> "Idle,
 *     waiting for input" — an honest label for "you can type the next
 *     instruction," not a stale "Building".
 *
 * The activity stream's own connection state (WS connecting/connected/
 * ended) is a separate, secondary concern — whether the CUSTOMER'S
 * BROWSER can currently see live updates, not whether the build/app
 * itself is healthy — so it renders as a small trailing note only while
 * still relevant (session open, not already reporting a deploy status).
 */
function BuildStatus({
  session,
  connection,
  latestEventType,
}: {
  session: KumbhaSession;
  connection: "connecting" | "connected" | "ended";
  latestEventType?: KumbhaEvent["type"];
}) {
  if (session.agent_running && latestEventType !== "idle") {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        <span className="bg-success h-1.5 w-1.5 animate-pulse rounded-full" aria-hidden />
        Building
      </span>
    );
  }

  if (session.last_deploy_failed) {
    return (
      <span
        className="text-destructive inline-flex items-center gap-1.5 text-xs"
        title={session.last_deploy_error || undefined}
      >
        <AlertTriangle className="h-3 w-3" />
        Last deploy failed
      </span>
    );
  }

  if (session.app_instance_id && session.app_status) {
    return (
      <span className="text-xs">
        <StatusPill status={session.app_status} message={session.app_status_message} />
      </span>
    );
  }

  if (session.status !== "open") {
    return (
      <span className="text-muted-foreground text-xs">
        Session {STATUS_LABEL[session.status]}
      </span>
    );
  }

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      Idle, waiting for input
      {connection === "connecting" && (
        <Loader2 className="h-3 w-3 animate-spin" aria-label="Connecting to activity stream" />
      )}
      {connection === "ended" && (
        <span title="Activity stream disconnected">· disconnected</span>
      )}
    </span>
  );
}

// How close to the bottom (px) still counts as "at the bottom" for
// autoscroll purposes — a little slack so a fraction-of-a-pixel rounding
// difference doesn't stop it following.
const AUTOSCROLL_THRESHOLD = 48;

/**
 * Owns the scroll container and only re-renders on `events`/`connection`
 * changing — NOT on session polling (BudgetMeter's own 3s refetch), which
 * lives in the sibling header above this and previously forced the whole
 * activity list to reconcile on every poll tick even though nothing in
 * the list itself had changed. Memoized for the same reason ActivityItem
 * is: a chat-style feed that's constantly appending should feel like
 * content sliding in underneath, not the page "refreshing".
 */
const ActivityFeed = memo(function ActivityFeed({
  events,
  connection,
}: {
  events: KumbhaEvent[];
  connection: "connecting" | "connected" | "ended";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // file_editor is the single noisiest tool in a real build — the agent
  // calls it for nearly every source change, and each one shows up twice
  // (action + observation). Rendering all of it made the feed unreadable
  // (found live 2026-08-26); the file itself is already visible in the
  // Code tab, and the workspace as a whole is what version history is
  // for (see version-history-dialog.tsx) — this feed's job is narrating
  // what the agent is DOING, not diffing what it wrote.
  const visibleEvents = events.filter((e) => e.tool !== "file_editor");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Only auto-follow if the customer was already at the bottom before
    // this update — otherwise appending events would yank them back down
    // while they're reading earlier history, the one thing a "seamless"
    // live feed must never do.
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [visibleEvents]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    wasAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < AUTOSCROLL_THRESHOLD;
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-3"
    >
      {visibleEvents.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          {connection === "connecting"
            ? "Connecting…"
            : "Watching for the agent to start working."}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {visibleEvents.map((event, i) => (
            <ActivityItem key={i} event={event} />
          ))}
        </ol>
      )}
    </div>
  );
});

const ActivityItem = memo(function ActivityItem({ event }: { event: KumbhaEvent }) {
  // present_deployment_plan's own observation carries raw JSON as its
  // summary (see parseDeploymentPlan in lib/api/types.ts) — the timeline
  // shows a short human label for it instead of a JSON blob; the actual
  // plan is presented in its own modal, not inline here.
  const isPlan =
    event.type === "observation" && event.tool === "present_deployment_plan";
  // The generic action icon (a wrench) doesn't read as "running a shell
  // command" — a terminal action specifically gets its own glyph.
  // Observations keep the uniform checkmark regardless of tool: that icon's
  // job is signalling "this step finished", not which tool ran.
  const Icon =
    event.type === "action" && event.tool === "terminal"
      ? SquareTerminal
      : EVENT_ICON[event.type];
  const text = isPlan
    ? "Presented an itemised cost estimate"
    : event.summary || defaultSummary(event);

  // terminal is the one remaining tool whose events can carry genuinely
  // long raw content (command output) rather than a short human sentence
  // — file_editor is filtered out of this feed entirely before it ever
  // reaches this component (see ActivityFeed's visibleEvents). Collapsed
  // by default with a one-line toggle, the same "the action line stays
  // visible, the result tucks away" pattern Claude's own tool-call UI
  // uses. Not restricted to observations: an action's own summary can be
  // just as long, so the same multi-line heuristic applies to both event
  // types uniformly.
  const isCollapsible = !isPlan && event.tool === "terminal" && text.includes("\n");

  return (
    <li className="flex gap-2.5">
      <Icon
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          event.type === "error" ? "text-destructive" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        {event.tool && (
          <span className="identifier text-muted-foreground mr-1.5 text-[11px]">
            {event.tool}
          </span>
        )}
        {isCollapsible ? (
          <CollapsibleOutput text={text} />
        ) : (
          <span className="text-foreground text-sm">{text}</span>
        )}
      </div>
    </li>
  );
});

function CollapsibleOutput({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = text.split("\n").filter(Boolean).length;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-muted-foreground hover:text-foreground -ml-0.5 inline-flex items-center gap-1 rounded px-0.5 text-xs transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden />
        )}
        {expanded ? "Hide output" : `Show output (${lineCount} line${lineCount === 1 ? "" : "s"})`}
      </button>
      {expanded && (
        <pre className="bg-muted/50 border-border hairline mt-1.5 max-h-64 overflow-auto rounded-md px-2.5 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {text}
        </pre>
      )}
    </div>
  );
}

function defaultSummary(event: KumbhaEvent): string {
  if (event.type === "idle") return "Waiting for the next instruction";
  return "";
}
