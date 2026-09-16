"use client";

/**
 * A build session's live view — the split layout Bolt/v0/Lovable
 * converged on (conversation + activity on one side, the result on the
 * other), rendered in this console's own considered, neutral visual
 * language rather than importing theirs: no signature accent, colour
 * reserved for meaning, hairline borders — see globals.css.
 *
 * This component owns the event WebSocket (KumbhaEventSocket) directly
 * rather than each child managing its own connection, so there is one
 * source of truth for the event list: SessionPanel renders it as a
 * timeline, and this file itself derives the deployment plan and any
 * live app URL from the same events, since both are just specific
 * observations within that one stream.
 */

import { use, useEffect, useRef, useState } from "react";

import { Square } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Loading } from "@/components/ui/loading";
import { useActiveProject } from "@/lib/active-project";
import { api, wsBaseUrl } from "@/lib/api/client";
import {
  errorMessage,
  useKumbhaSession,
  useStopKumbhaAgent,
} from "@/lib/api/hooks";
import { parseDeploymentPlan } from "@/lib/api/types";
import type { KumbhaEvent } from "@/lib/api/types";
import { KumbhaEventSocket } from "@/lib/kumbha-event-socket";
import { CodePanel } from "./code-panel";
import { DeploymentPlanModal } from "./deployment-plan-modal";
import { PreviewPanel } from "./preview-panel";
import { ResultPanelSwitcher, type ResultPanelTab } from "./result-panel-switcher";
import { SessionPanel } from "./session-panel";

type ConnectionState = "connecting" | "connected" | "ended";

export default function BuildSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { project } = useActiveProject();
  const ready = Boolean(project);

  const session = useKumbhaSession(id, ready);
  const stop = useStopKumbhaAgent(id);
  const [confirmingStop, setConfirmingStop] = useState(false);

  const [events, setEvents] = useState<KumbhaEvent[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const socketRef = useRef<KumbhaEventSocket | null>(null);

  // Code by default — there is nothing to preview until the agent
  // deploys something, so the IDE is the more useful starting tab; once
  // an app URL shows up this is left alone (a customer already looking at
  // code mid-build should not be yanked away from it automatically).
  const [resultTab, setResultTab] = useState<ResultPanelTab>("code");

  // Read fresh inside the reconnect loop without making session data a
  // dependency of the connection effect below — re-running that effect on
  // every 3s status poll would tear down and recreate a socket that's
  // working fine. Only whether the session is still "open" matters for
  // deciding whether a drop is worth retrying.
  const sessionStatusRef = useRef(session.data?.status);
  useEffect(() => {
    sessionStatusRef.current = session.data?.status;
  }, [session.data?.status]);

  // Forces the connection effect below to tear down and reconnect —
  // incrementing this is in its dependency array. Needed specifically
  // for a relaunch: DeliverMessage (chat + resume) starts a BRAND NEW
  // agent pod with a new instance ID when the previous one already
  // exited, but a WS connection already open is bound to whatever ticket
  // it originally resolved — it has no way to learn a new pod now
  // exists. Left alone, the backend's own recovery (pkg/kumbha/events.go
  // streamLogsWithRetry's cold-start retry, tailing the OLD dead
  // instance ID) can take up to its full 5-minute budget before it gives
  // up and lets the frontend fetch a fresh ticket — during which the
  // activity feed shows nothing at all, even though agent_running (a
  // separate, fast 3s REST poll) has already correctly flipped true.
  // Found live 2026-08-31: exactly this — status pill said "Building",
  // feed stayed on "Watching for the agent to start working." indefinitely.
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const wasAgentRunningRef = useRef(false);
  useEffect(() => {
    const running = Boolean(session.data?.agent_running);
    if (running && !wasAgentRunningRef.current) {
      setReconnectNonce((n) => n + 1);
    }
    wasAgentRunningRef.current = running;
  }, [session.data?.agent_running]);

  // One connection for the lifetime of this page, re-run on `id` or
  // `ready` changing. `ready` MUST be a real dependency: on first mount
  // useActiveProject() can still be resolving, so an effect that only
  // watched `id` would see ready === false once, return immediately,
  // and then never run again once ready actually flipped true — no
  // socket ever gets created, no error, no success, just permanently
  // stuck on the initial "connecting" state (found live 2026-08-23).
  // The cleanup below already tears down and recreates the socket
  // correctly on any dependency change, so there is no actual
  // "reconnecting an already-open socket" hazard to guard against.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stableTimer: ReturnType<typeof setTimeout> | undefined;

    function scheduleRetry() {
      clearTimeout(stableTimer);
      setConnection("connecting");
      const delay = Math.min(2000 * 2 ** attempt, 15000);
      attempt += 1;
      retryTimer = setTimeout(() => void connect(), delay);
    }

    async function connect() {
      try {
        const ticket = await api.createKumbhaEventTicket(id);
        if (cancelled) return;

        // StreamLogs has no way to resume from a checkpoint — every fresh
        // connection re-sends the pod's ENTIRE log history from the start,
        // then follows live. Reset here (not just on the very first
        // connect) so a reconnect replaces that replay instead of
        // appending a second copy of everything already shown — the
        // "same messages repeating" bug this line exists to fix
        // (found live 2026-08-23, introduced by the reconnect logic
        // itself: every reconnect was appending a full duplicate history).
        setEvents([]);

        const socket = new KumbhaEventSocket();
        socketRef.current = socket;
        socket.onEvent = (event) =>
          setEvents((prev) => (cancelled ? prev : [...prev, event]));
        // The agent's own stream ending — "closed" — is a genuine
        // terminal state (the agent finished, or the session ended)
        // and must NOT retry: there is nothing left to reconnect to.
        socket.onClosed = () => {
          clearTimeout(stableTimer);
          if (!cancelled) setConnection("ended");
        };
        // Everything else — a dropped connection, a transient backend
        // hiccup, the pod not being reachable yet — is worth retrying
        // rather than stranding the customer on a manual-refresh-only
        // "disconnected" state. Stops retrying once the session itself
        // is confirmed no longer open — nothing to watch for at that
        // point either.
        socket.onError = () => {
          if (cancelled) return;
          if (sessionStatusRef.current && sessionStatusRef.current !== "open") {
            clearTimeout(stableTimer);
            setConnection("ended");
            return;
          }
          scheduleRetry();
        };

        socket.connect(
          `${wsBaseUrl()}${ticket.attach_path}`,
          ticket.ticket_id,
          ticket.ticket_secret,
        );
        if (!cancelled) {
          setConnection("connected");
          // Only counts as a real recovery once it survives a few
          // seconds — resetting the backoff the instant .connect() is
          // called (the previous behaviour) meant a connection that
          // flapped every second or two never actually backed off: it
          // kept retrying at the ~2s floor forever instead of slowing
          // down, hammering the backend on every blip.
          stableTimer = setTimeout(() => {
            attempt = 0;
          }, 10_000);
        }
      } catch {
        if (cancelled) return;
        scheduleRetry();
      }
    }
    void connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearTimeout(stableTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
    // reconnectNonce is intentionally in this array purely to force a
    // teardown+reconnect on a detected relaunch (see its own comment
    // above) — it is otherwise unused inside this effect.
  }, [id, ready, reconnectNonce]);

  // The most recently presented plan — later observations supersede
  // earlier ones if the agent revises its estimate (e.g. after adding a
  // resource the customer asked for).
  const latestPlan = findLast(events, parseDeploymentPlan);
  const [planDismissed, setPlanDismissed] = useState(false);
  // Reopening via "Review deployment plan" is a SEPARATE condition from
  // the auto-popup: the auto-popup must stop offering itself the instant
  // deploy_approved flips (that's the whole point of the gate), but the
  // button's own job is showing the plan again on demand, approved or
  // not — gating it on !deploy_approved too meant the button did
  // nothing, ever, after the customer's first approval (found live
  // 2026-08-31: "the button doesn't show anything post approval").
  const [manualReviewOpen, setManualReviewOpen] = useState(false);
  const showPlanModal =
    Boolean(latestPlan) &&
    (manualReviewOpen || (!session.data?.deploy_approved && !planDismissed));

  // A live app URL, preferring the session poll's own live cluster read
  // (session.data.app_endpoint — see GetKumbhaSession's own doc comment)
  // over two weaker fallbacks: manualDeployUrl, set the instant the
  // console IDE's own Deploy button succeeds (CodePanel's onDeployed),
  // before the next 3s session poll has even landed; and an event-parsed
  // URL, defensively scraped from the agent's create_instance/deploy
  // plain-text summaries (there is no structured "url" field on
  // KumbhaEvent) for a deployment plane too old to report app_endpoint at
  // all. app_endpoint wins once present because it is the only one of
  // the three that is still correct after a page reload with no event
  // history and no fresh manual-deploy click.
  const [manualDeployUrl, setManualDeployUrl] = useState<string | null>(null);
  const appUrl =
    session.data?.app_endpoint || manualDeployUrl || findLast(events, extractAppUrl);

  // Auto-switch to Preview the moment a deployed app first becomes
  // reachable — whether that deploy came from the agent's own tool calls
  // (chat-driven) or the console IDE's Deploy button, both of which
  // previously left the customer parked on whatever tab they already had
  // open with no indication anything had shipped. Fires once per URL
  // (a change, not just "URL is truthy"), so it never yanks the customer
  // back to Preview after they've deliberately switched to Code to keep
  // working post-deploy.
  const previousAppUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (appUrl && appUrl !== previousAppUrlRef.current) {
      setResultTab("preview");
    }
    previousAppUrlRef.current = appUrl ?? null;
  }, [appUrl]);

  const data = session.data;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Projects", href: "/projects" },
          project ? { label: project.name, href: "/home" } : "…",
          { label: "Kumbha", href: "/build" },
          data?.label || id,
        ]}
        action={
          data?.agent_running ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingStop(true)}
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          ) : undefined
        }
      />

      {session.isLoading ? (
        <Loading className="py-24" />
      ) : session.isError ? (
        <div className="p-6">
          <p className="text-destructive text-sm">{errorMessage(session.error)}</p>
        </div>
      ) : data ? (
        <div className="flex h-[calc(100dvh-3rem)] flex-col lg:flex-row">
          <div className="hairline-r flex min-w-0 flex-1 flex-col border-border lg:max-w-md">
            <SessionPanel
              session={data}
              events={events}
              connection={connection}
              hasPlan={Boolean(latestPlan)}
              onReviewPlan={() => setManualReviewOpen(true)}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="hairline-b border-border flex shrink-0 items-center justify-end px-2 py-1">
              <ResultPanelSwitcher active={resultTab} onChange={setResultTab} />
            </div>
            <div className="min-h-0 flex-1">
              {resultTab === "preview" ? (
                <PreviewPanel
                  sessionId={id}
                  url={appUrl}
                  instanceId={data.app_instance_id || null}
                  status={data.app_status}
                  statusMessage={data.app_status_message}
                  deployApproved={data.deploy_approved}
                />
              ) : (
                <CodePanel
                  sessionId={id}
                  sessionStatus={data.status}
                  deployApproved={data.deploy_approved}
                  onDeployed={(endpoint) => {
                    setManualDeployUrl(endpoint);
                    setResultTab("preview");
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showPlanModal && latestPlan && (
        <DeploymentPlanModal
          plan={latestPlan}
          sessionId={id}
          deployApproved={Boolean(session.data?.deploy_approved)}
          onDismiss={() => {
            setPlanDismissed(true);
            setManualReviewOpen(false);
          }}
        />
      )}

      {confirmingStop && (
        <Dialog
          title="Stop the agent"
          description="Interrupts whatever the agent is doing right now — an immediate stop, not a graceful pause, so anything mid-turn is lost. Everything already saved to the workspace is kept, and you can send another message afterward to pick up from there. Infrastructure it already deployed keeps running and billing normally."
          onClose={() => setConfirmingStop(false)}
          footer={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingStop(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={stop.isPending}
                onClick={() =>
                  stop.mutate(undefined, {
                    onSuccess: () => setConfirmingStop(false),
                  })
                }
              >
                {stop.isPending ? "Stopping…" : "Stop"}
              </Button>
            </>
          }
        >
          {stop.isError && (
            <p className="text-destructive text-xs">{errorMessage(stop.error)}</p>
          )}
        </Dialog>
      )}
    </>
  );
}

/** Scans events newest-first and returns the first mapped non-null
 *  result — the shared shape behind "the latest plan" and "the latest
 *  app URL", both of which want the most recent match, not the first. */
function findLast<T>(
  events: KumbhaEvent[],
  extract: (event: KumbhaEvent) => T | null,
): T | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const result = extract(events[i]);
    if (result !== null) return result;
  }
  return null;
}

function extractAppUrl(event: KumbhaEvent): string | null {
  if (event.type !== "observation" || !event.tool) return null;
  if (event.tool !== "create_instance" && event.tool !== "deploy") return null;
  const match = event.summary?.match(/https:\/\/\S+/);
  return match ? match[0].replace(/[.,)]+$/, "") : null;
}
