"use client";

/**
 * The deployment thumbnail — a real screenshot of the deployed app,
 * captured server-side by a headless-Chromium pod right after each
 * (re)deploy (see pkg/kumbha.Gateway.CaptureScreenshot) and served as a
 * PNG (GetKumbhaScreenshot). This is the actual image half of the Vercel-
 * style deployment card; preview-panel.tsx's metadata card is the other.
 *
 * Fetched as an authenticated blob rather than a plain <img src>: the
 * endpoint requires the same Authorization/X-Project-ID headers every
 * other customer-facing read does, which a bare <img> tag cannot send
 * (see api.fetchKumbhaScreenshot's own doc comment).
 *
 * Polls after a status transition rather than fetching once: the
 * instance's OWN status flips to "running" almost immediately (the app
 * pod itself becoming reachable), while the screenshot capture is a
 * separate, slower background process — up to ~4 minutes on a home node
 * that has to pull its own multi-GB image fresh (see
 * kumbha.CaptureTimeoutDefault, pkg/kumbha/agent.go). A single fetch
 * right after the status change reliably lands before the capture has
 * finished, gets a 404, and — before this — never checked again until
 * the NEXT redeploy. Found live 2026-08-31: a customer had to manually
 * reload the page to see a thumbnail that was, by then, already
 * captured. Now keeps polling until the screenshot shows up, per an
 * explicit product decision only stopping early (and only THEN showing
 * "couldn't capture") when the deployment itself reaches a state nothing
 * will ever produce a screenshot for — everything else, including a
 * capture that is simply taking a while, stays on the loading state
 * rather than flashing a false failure.
 */

import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";

import { api } from "@/lib/api/client";
import type { InstanceStatus } from "@/lib/api/types";

// Comfortably past the server's own worst-case capture budget
// (kumbha.CaptureTimeoutDefault's 4 minutes plus triggerScreenshotCapture's
// own +10s margin, pkg/kumbha/agent.go / pkg/api/kumbha_handlers.go), so a
// genuinely in-progress capture is never given up on early. Past this, the
// effect simply stops re-checking — it does NOT switch to the "none" state,
// since a slow-but-still-running capture and an abandoned one look
// identical from here.
const POLL_INTERVAL_MS = 8_000;
const POLL_TIMEOUT_MS = 6 * 60_000;

// The only states nothing will ever produce a screenshot for — everything
// else (including a status this component hasn't observed update to yet)
// keeps polling rather than showing a false "couldn't capture".
const TERMINAL_FAILURE_STATUSES: ReadonlySet<InstanceStatus> = new Set([
  "failed",
  "terminated",
]);

export function DeploymentThumbnail({
  sessionId,
  status,
}: {
  sessionId: string;
  status?: InstanceStatus;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");

  useEffect(() => {
    // No synchronous reset to "loading" here on purpose — on a redeploy
    // (a `status` change, this effect's other dependency) the PREVIOUS
    // thumbnail stays visible until the new one is ready, rather than
    // flashing back to a spinner every time; the very first mount is
    // covered by state's own "loading" initial value.
    let cancelled = false;
    let currentUrl: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const scheduleRetry = () => {
      if (Date.now() - startedAt < POLL_TIMEOUT_MS) {
        timer = setTimeout(attempt, POLL_INTERVAL_MS);
      }
    };

    const attempt = () => {
      api
        .fetchKumbhaScreenshot(sessionId)
        .then((url) => {
          if (cancelled) {
            if (url) URL.revokeObjectURL(url);
            return;
          }
          if (url) {
            currentUrl = url;
            setObjectUrl(url);
            setState("ready");
            return;
          }
          if (status !== undefined && TERMINAL_FAILURE_STATUSES.has(status)) {
            setState("none");
            return;
          }
          setState("loading");
          scheduleRetry();
        })
        .catch(() => {
          // A transient network/auth blip must not permanently end the
          // poll — only a terminal deployment status does that.
          if (cancelled) return;
          if (status !== undefined && TERMINAL_FAILURE_STATUSES.has(status)) {
            setState("none");
            return;
          }
          scheduleRetry();
        });
    };

    attempt();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [sessionId, status]);

  return (
    <div className="hairline border-border bg-muted/30 flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg">
      {state === "loading" && (
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      )}
      {state === "none" && (
        <div className="flex flex-col items-center gap-1.5 text-center">
          <ImageOff className="text-muted-foreground h-5 w-5" />
          <p className="text-muted-foreground text-xs">
            No thumbnail captured yet
          </p>
        </div>
      )}
      {/* A blob: object URL, not a static/remote asset next/image's
          loader can resolve — next/image is not usable here. */}
      {state === "ready" && objectUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={objectUrl}
          alt="Deployment preview"
          className="h-full w-full object-cover object-top"
        />
      )}
    </div>
  );
}
