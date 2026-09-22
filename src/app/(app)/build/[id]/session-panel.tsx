"use client";

/**
 * The live build feed — the "watch it work" surface KUMBHA-DESIGN.md's
 * process-transparency correction exists for. Rewritten 2026-09-22 from a
 * raw technical activity log (tool names, terminal output, an "action"/
 * "observation" taxonomy) into a plain-language conversation: a customer
 * watching a build should read prose ("Setting up your app…"), not
 * OpenHands' own tool vocabulary. See interpretEvent below for the
 * translation table — which backend model served a step is structurally
 * never present in the first place (pkg/kumbha/events.go's server-side
 * allowlist), so there's nothing to hide on that front, only jargon to
 * translate.
 */

import { memo, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Globe,
  Layers,
  Link2,
  Loader2,
  PauseCircle,
  Rocket,
  Sparkles,
  SquareTerminal,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status";
import { errorMessage, useSendKumbhaMessage } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/lib/motion";
import type { KumbhaEvent, KumbhaSession, KumbhaTask } from "@/lib/api/types";
import { BudgetMeter } from "./budget-meter";
import { ResourcesPanel } from "./resources-panel";

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
  // Optimistic echo: a sent message appears as a bubble the instant the
  // send succeeds, not whenever the agent pod eventually gets around to
  // echoing it back as a real MessageEvent. Found live 2026-09-22: a
  // relaunch (fresh pod — Python startup, SDK import, tool loading, the
  // same ~10-15s seen in every captured pod log) left the feed showing
  // nothing new for that whole stretch, with only the small "Picking up
  // where things left off" notice as any sign the send even registered —
  // every comparable product (Claude, ChatGPT, Codex) shows your own
  // message immediately instead of waiting on a round-trip.
  const [pending, setPending] = useState<string[]>([]);
  const lastEventCountRef = useRef(events.length);
  useEffect(() => {
    // Once real events start arriving again after a send, trust the
    // server's own event stream to include the real echo (or better —
    // the actual answer) from here on, and drop the optimistic stand-ins
    // rather than risk showing the same message twice.
    if (events.length > lastEventCountRef.current && pending.length > 0) {
      setPending([]);
    }
    lastEventCountRef.current = events.length;
  }, [events.length, pending.length]);

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

      <ConversationFeed events={events} connection={connection} pending={pending} />

      {session.status === "open" && (
        <ChatInput
          sessionId={session.id}
          onSent={(text) => setPending((prev) => [...prev, text])}
        />
      )}
    </div>
  );
}

/**
 * "Chat + resume" — a follow-up instruction after the session's initial
 * prompt. What happens to it is server-side (Gateway.DeliverMessage): if
 * the agent pod is still alive it's queued for the SAME conversation
 * (full history intact); if not, a fresh pod is launched with it as the
 * new prompt. The real reaction shows up in the feed above via the event
 * stream — this component's own job is just the send itself, plus (via
 * onSent) telling the parent to echo the message immediately rather than
 * leaving the customer looking at nothing until the event stream catches
 * up, which can take a while on a relaunch.
 */
function ChatInput({
  sessionId,
  onSent,
}: {
  sessionId: string;
  onSent: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const send = useSendKumbhaMessage(sessionId);

  function submit() {
    const content = value.trim();
    if (!content || send.isPending) return;
    send.mutate(content, {
      onSuccess: (result) => {
        setValue("");
        onSent(content);
        setNotice(
          result.relaunched
            ? "Picking up where things left off — this may take a little longer than usual."
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
 *     instruction" — visible in the feed below this pill), so the most
 *     recent event's type is the correct tie-breaker between "still
 *     alive, but idle" and "actually working" — cheaper and more precise
 *     than adding a second live-poll signal.
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
 *  5. Nothing deployed yet, session still open, agent idle -> distinct
 *     labels for "never started" vs "finished a turn and is waiting for
 *     you" (see below) — an honest read of what's actually happening,
 *     not a single ambiguous "Idle" for both.
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

  // "Never started" (no activity at all yet) and "finished a turn, now
  // waiting on you" read very differently to a customer watching this —
  // conflating them into one bare "Idle" is exactly what made a stuck
  // launch and a normal pause between messages look identical (the
  // confusion that prompted this whole rework).
  const label = latestEventType ? "Waiting for your reply" : "Getting started…";

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      {label}
      {connection === "connecting" && (
        <Loader2 className="h-3 w-3 animate-spin" aria-label="Connecting to activity stream" />
      )}
      {connection === "ended" && !latestEventType && (
        <span title="Activity stream disconnected">· disconnected</span>
      )}
    </span>
  );
}

// --- Plain-language interpretation ---
//
// A raw KumbhaEvent speaks OpenHands' vocabulary (tool ids, an
// action/observation split, terminal stdout). A customer watching a build
// should never see any of that — interpretEvent turns each event into
// exactly one of: a chat bubble (something someone said), a short
// narration line (something the agent is doing), or nothing at all
// (filtered out as noise). This is the single place that translation
// happens, so every render path agrees on it.

type Interpreted =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string; reasoning?: string }
  | { kind: "activity"; label: string; detail?: string; diff?: string; isError?: boolean; icon: React.ComponentType<{ className?: string }> }
  | { kind: "error"; text: string }
  | { kind: "idle" }
  | { kind: "tasks"; tasks: KumbhaTask[] }
  | null; // filtered out — carries no customer-facing meaning

const TOOL_COPY: Record<string, { action: string; observation: string; icon: React.ComponentType<{ className?: string }> }> = {
  terminal: { action: "Running a command", observation: "Command finished", icon: SquareTerminal },
  task_tracker: { action: "Planning the next steps", observation: "Updated the plan", icon: Layers },
  browser_navigate: { action: "Opening a page", observation: "Page loaded", icon: Globe },
  browser_click: { action: "Clicking on the page", observation: "Clicked", icon: Globe },
  browser_type: { action: "Typing into the page", observation: "Typed", icon: Globe },
  browser_get_state: { action: "Checking the page", observation: "Checked the page", icon: Globe },
  browser_get_content: { action: "Reading the page", observation: "Read the page", icon: Globe },
  browser_scroll: { action: "Scrolling the page", observation: "Scrolled", icon: Globe },
  browser_go_back: { action: "Going back a page", observation: "Went back", icon: Globe },
  browser_list_tabs: { action: "Checking open tabs", observation: "Checked tabs", icon: Globe },
  browser_switch_tab: { action: "Switching tabs", observation: "Switched tabs", icon: Globe },
  browser_close_tab: { action: "Closing a tab", observation: "Closed a tab", icon: Globe },
  browser_get_storage: { action: "Checking saved browser data", observation: "Checked browser data", icon: Globe },
  browser_set_storage: { action: "Updating saved browser data", observation: "Updated browser data", icon: Globe },
  browser_start_recording: { action: "Starting a screen recording", observation: "Recording started", icon: Globe },
  browser_stop_recording: { action: "Stopping the recording", observation: "Recording stopped", icon: Globe },
  attach_domain: { action: "Connecting your domain", observation: "Domain connected", icon: Link2 },
  create_instance: { action: "Setting up your app", observation: "Your app is set up", icon: Rocket },
  deploy: { action: "Deploying your build", observation: "Deployed", icon: Rocket },
  present_deployment_plan: { action: "Preparing a cost estimate", observation: "Prepared a cost estimate", icon: Sparkles },
  finish: { action: "Wrapping up", observation: "Done", icon: Sparkles },
  think: { action: "Thinking it through", observation: "Thought it through", icon: Sparkles },
};

// interpretEvent can expand to MORE than one feed item from a single raw
// event: this agent build doesn't emit a separate event per tool call — a
// whole turn (narration text plus every <function_calls> invocation)
// arrives as ONE "message" event with the tool-call XML embedded directly
// in its text (confirmed live 2026-09-22 from a real pod's stdout: a turn
// with five bash calls produced exactly one JSON event line, not five).
// parseAgentMessage below is what turns that into "one compact line for
// the tool work, one real bubble for what the agent actually said" —
// never the raw XML soup a customer has no reason to see.
function interpretEvent(event: KumbhaEvent): NonNullable<Interpreted>[] {
  switch (event.type) {
    case "message":
      return parseMessage(event.summary ?? "", event.role, event.reasoning);
    case "error":
      return [{ kind: "error", text: event.summary || "Something went wrong." }];
    case "idle":
      return [{ kind: "idle" }];
    case "tasks":
      return [{ kind: "tasks", tasks: event.tasks ?? [] }];
    case "action":
    case "observation": {
      // file_editor is filtered upstream (below) before this ever runs —
      // it fires for nearly every source change and would drown out
      // everything else.
      const tool = event.tool ?? "";
      const copy = TOOL_COPY[tool];
      if (!copy) return []; // an unrecognised tool narrates as nothing rather than raw jargon
      return [{
        kind: "activity",
        label: event.type === "action" ? copy.action : copy.observation,
        detail: event.type === "observation" ? event.summary : undefined,
        diff: event.diff,
        isError: event.is_error,
        icon: copy.icon,
      }];
    }
    default:
      return [];
  }
}

// The agent image (run.py, a separate codebase from teepin-core) prepends
// operating-instruction paragraphs to the very first prompt it receives —
// confirmed live 2026-09-22 the order is vision-capability note FIRST,
// then the ".teepin-internal" scratch-dir note second — and
// DeliverMessage's own resume wrapper (agent.go) wraps every follow-up
// after a relaunch. None of it is something the customer actually said,
// so none of it belongs in their chat bubble. Loops until no known marker
// matches at the front (rather than one fixed-order pass) specifically
// because of that ordering: a single pass stripped only the first note
// and left the second one exposed exactly as a "user" bubble (found live
// 2026-09-22, screenshot showed the raw scratch-dir instructions rendered
// as if the customer had typed them). Best-effort throughout: if the
// known wording ever drifts in that other codebase, this simply stops
// matching and falls back to the raw text rather than breaking.
function stripKnownWrapper(text: string): string {
  let out = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const marker of ["Keep any of your own internal working notes", "(Note: this deployment has not confirmed"]) {
      if (out.startsWith(marker)) {
        const blank = out.indexOf("\n\n");
        out = blank === -1 ? "" : out.slice(blank + 2);
        changed = true;
      }
    }
  }
  const resumeMatch = out.match(/The customer sent a new message after your previous run ended: "([\s\S]*)"\n\nYour workspace already contains/);
  if (resumeMatch) return resumeMatch[1];
  return out.trim();
}

const FUNCTION_CALLS_BLOCK = /<function_calls>[\s\S]*?<\/function_calls>/g;
const INVOKE_NAME = /<invoke name="([^"]+)">/g;

// Reduces "narrate a bit, call some tools, narrate a bit more, call more
// tools" down to what the customer should actually see: one compact line
// standing in for all the tool work, followed by the agent's real,
// substantive reply — never the intermediate "Let me check…" filler
// between tool calls, and never the raw <function_calls> markup itself.
// Everything before the FINAL block is discarded outright, not
// summarized piecemeal — a customer doesn't need a play-by-play of five
// "let me look at one more thing" sentences, they need to know work
// happened and then read the actual answer.
function parseAgentMessage(rawText: string, reasoning?: string): NonNullable<Interpreted>[] {
  const trimmed = rawText.trim();
  const blocks = trimmed.match(FUNCTION_CALLS_BLOCK) ?? [];
  let remainder = blocks.length ? trimmed.split(FUNCTION_CALLS_BLOCK).pop()!.trim() : trimmed;

  // A dangling, unclosed <function_calls> tag — no matching
  // </function_calls> anywhere after it — means this snapshot was
  // captured mid tool-call (or the turn was cut short before it closed).
  // Found live 2026-09-22: a turn that ended with an in-progress
  // invocation showed the raw "<function_calls>\n<invoke…" markup
  // verbatim in a bubble, because the "no complete block found" path
  // below fell straight through to showing the whole raw text — never
  // checked for a partial one. Anything from that dangling tag onward is
  // discarded the same way an in-between "let me check…" fragment
  // already is, not shown as if it were finished prose.
  const danglingAt = remainder.indexOf("<function_calls>");
  const hasDangling = danglingAt !== -1;
  if (hasDangling) remainder = remainder.slice(0, danglingAt).trim();

  if (blocks.length === 0 && !hasDangling) {
    return remainder ? [{ kind: "agent", text: remainder, reasoning }] : [];
  }
  const items: NonNullable<Interpreted>[] = [
    { kind: "activity", label: summarizeToolBlocks(blocks), icon: Wrench },
  ];
  if (remainder) items.push({ kind: "agent", text: remainder, reasoning });
  return items;
}

function summarizeToolBlocks(blocks: string[]): string {
  const names = new Set<string>();
  for (const block of blocks) {
    let m: RegExpExecArray | null;
    while ((m = INVOKE_NAME.exec(block))) names.add(m[1]);
  }
  if (names.has("bash")) return "Ran a few commands";
  if ([...names].some((n) => n.startsWith("browser"))) return "Checked the page";
  if (names.has("deploy")) return "Deployed the build";
  if (names.has("create_instance")) return "Set things up";
  if (names.has("str_replace_editor") || names.has("file_editor")) return "Made some edits";
  if (names.has("think")) return "Thought it through";
  return "Took a few steps";
}

function parseMessage(
  summary: string,
  role: KumbhaEvent["role"],
  reasoning?: string,
): NonNullable<Interpreted>[] {
  // "environment"/"hook" sources exist in the SDK's SourceType but
  // MessageEvent itself only ever carries "agent" or "user" in practice
  // (its own docstring: "Message from either agent or user") — anything
  // else is unrecognised rather than guessed at.
  if (role === "user") {
    const text = stripKnownWrapper(summary);
    return text ? [{ kind: "user", text }] : [];
  }
  if (role === "agent") {
    return parseAgentMessage(summary, reasoning);
  }
  return [];
}

// How close to the bottom (px) still counts as "at the bottom" for
// autoscroll purposes — a little slack so a fraction-of-a-pixel rounding
// difference doesn't stop it following.
const AUTOSCROLL_THRESHOLD = 48;

/**
 * Owns the scroll container and only re-renders on `events`/`connection`
 * changing — NOT on session polling (BudgetMeter's own 3s refetch), which
 * lives in the sibling header above this and previously forced the whole
 * feed to reconcile on every poll tick even though nothing in the list
 * itself had changed. Memoized for the same reason ActivityItem is: a
 * chat-style feed that's constantly appending should feel like content
 * sliding in underneath, not the page "refreshing".
 */
const ConversationFeed = memo(function ConversationFeed({
  events,
  connection,
  pending,
}: {
  events: KumbhaEvent[];
  connection: "connecting" | "connected" | "ended";
  /** Optimistically-echoed sent messages not yet confirmed by a real
   *  event — see SessionPanel's own doc comment. Always rendered last,
   *  since they're always the most recent thing that happened. */
  pending: string[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  const allItems = events
    .filter((e) => e.tool !== "file_editor")
    .flatMap((e) => interpretEvent(e));

  // The task checklist is persistent state (task_tracker's full current
  // list, replacing whatever was shown before), not another line in a
  // flowing feed — pulled out and pinned above the scroll area instead of
  // interleaved with everything else, the same way a real coding agent's
  // to-do list stays visible while the conversation scrolls underneath it.
  // Found from the end: the LATEST "tasks" item is the current state: a
  // .find on the reversed list is simplest, and this array is small.
  const latestTasksItem = [...allItems].reverse().find((item) => item.kind === "tasks");
  const latestTasks = latestTasksItem?.kind === "tasks" ? latestTasksItem.tasks : null;
  const items: Exclude<NonNullable<Interpreted>, { kind: "tasks" }>[] = [
    ...allItems.filter(
      (item): item is Exclude<NonNullable<Interpreted>, { kind: "tasks" }> => item.kind !== "tasks",
    ),
    ...pending.map((text): Exclude<NonNullable<Interpreted>, { kind: "tasks" }> => ({ kind: "user", text })),
  ];

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
  }, [items.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    wasAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < AUTOSCROLL_THRESHOLD;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {latestTasks && latestTasks.length > 0 && (
        <TaskChecklist tasks={latestTasks} />
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {items.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            {connection === "connecting"
              ? "Connecting…"
              : "Watching for the agent to start working."}
          </p>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {items.map((item, i) => (
              <FeedItem key={i} item={item} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
});

/**
 * A persistent, pinned checklist — task_tracker's full current list, sent
 * fresh (never a delta) on every update, so this just replaces its whole
 * rendered state rather than reconciling an append. Pinned above the
 * scrollable feed, not inside it: a to-do list is state to glance at
 * anytime, not a message that should scroll out of view.
 */
function TaskChecklist({ tasks }: { tasks: KumbhaTask[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="hairline-b border-border shrink-0 px-4 py-2.5">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 text-xs transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
        <Layers className="h-3 w-3" aria-hidden />
        <span>Tasks ({done}/{tasks.length})</span>
      </button>
      {!collapsed && (
        <ol className="mt-2 flex flex-col gap-1.5">
          {tasks.map((task, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs">
              {task.status === "done" ? (
                <CheckCircle2 className="text-success mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : task.status === "in_progress" ? (
                <CircleDot className="text-foreground mt-0.5 h-3.5 w-3.5 shrink-0 animate-pulse" aria-hidden />
              ) : (
                <Circle className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <span className={cn(task.status === "done" ? "text-muted-foreground line-through" : "text-foreground")}>
                  {task.title}
                </span>
                {task.notes && (
                  <p className="text-muted-foreground mt-0.5">{task.notes}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const FeedItem = memo(function FeedItem({
  item,
}: {
  item: Exclude<NonNullable<Interpreted>, { kind: "tasks" }>;
}) {
  const animate = !prefersReducedMotion();
  const animClass = animate ? "animate-message-in" : "";

  if (item.kind === "user") {
    return (
      <li className={cn("flex justify-end", animClass)}>
        <div className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm">
          {item.text}
        </div>
      </li>
    );
  }

  if (item.kind === "agent") {
    return (
      <li className={cn("flex flex-col items-start gap-1", animClass)}>
        {item.reasoning && <ThinkingToggle text={item.reasoning} />}
        <div className="bg-muted text-foreground max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm whitespace-pre-wrap">
          {item.text}
        </div>
      </li>
    );
  }

  if (item.kind === "error") {
    return (
      <li className={cn("flex items-start gap-2", animClass)}>
        <AlertTriangle className="text-destructive mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="text-destructive text-sm">{item.text}</span>
      </li>
    );
  }

  if (item.kind === "idle") {
    return (
      <li className={cn("text-muted-foreground flex items-center gap-1.5 text-xs", animClass)}>
        <PauseCircle className="h-3 w-3" aria-hidden />
        Waiting for the next instruction
      </li>
    );
  }

  // activity
  const Icon = item.icon;
  const hasDetail = Boolean(item.detail && item.detail.includes("\n"));
  return (
    <li className={cn("flex items-start gap-2", animClass)}>
      {item.isError ? (
        <AlertTriangle className="text-destructive mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Icon className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <span className={cn("text-xs", item.isError ? "text-destructive" : "text-muted-foreground")}>
          {item.label}
        </span>
        {item.diff ? (
          <DiffView text={item.diff} />
        ) : (
          hasDetail && <CollapsibleOutput text={item.detail!} />
        )}
      </div>
    </li>
  );
});

/**
 * A model's extended-thinking text for one turn (run.py's
 * summarize_reasoning — Anthropic thinking blocks, plaintext only, never
 * the encrypted/redacted kind). Collapsed by default, same "the answer
 * stays visible, the reasoning tucks away" pattern as CollapsibleOutput,
 * placed above the response bubble it led to rather than folded inside it.
 */
function ThinkingToggle({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded px-0.5 text-xs transition-colors"
      >
        <BrainCircuit className="h-3 w-3" aria-hidden />
        {expanded ? "Hide thinking" : "Thought about this"}
      </button>
      {expanded && (
        <p className="text-muted-foreground border-border hairline-l mt-1 ml-1.5 border-l pl-2.5 text-xs italic whitespace-pre-wrap">
          {text}
        </p>
      )}
    </div>
  );
}

const DIFF_LINE_CLASS: Record<string, string> = {
  "+": "text-success",
  "-": "text-destructive",
  "@": "text-muted-foreground",
};

/** A unified diff (run.py's diff_lines, pre-computed server-side) —
 *  colors +/- lines the way every diff view does; the console never
 *  computes the diff itself, only renders lines it's already given. */
function DiffView({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(true);
  const lines = text.split("\n");
  const changedCount = lines.filter((l) => l.startsWith("+") || l.startsWith("-")).length;

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
        {expanded ? "Hide diff" : `Show diff (${changedCount} line${changedCount === 1 ? "" : "s"} changed)`}
      </button>
      {expanded && (
        <pre className="bg-muted/50 border-border hairline mt-1.5 max-h-80 overflow-auto rounded-md px-2.5 py-2 font-mono text-xs leading-relaxed">
          {lines.map((line, i) => (
            <div
              key={i}
              className={cn("whitespace-pre", DIFF_LINE_CLASS[line[0]] ?? "text-foreground")}
            >
              {line}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

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
        {expanded ? "Hide details" : `Show details (${lineCount} line${lineCount === 1 ? "" : "s"})`}
      </button>
      {expanded && (
        <pre className="bg-muted/50 border-border hairline mt-1.5 max-h-64 overflow-auto rounded-md px-2.5 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {text}
        </pre>
      )}
    </div>
  );
}
