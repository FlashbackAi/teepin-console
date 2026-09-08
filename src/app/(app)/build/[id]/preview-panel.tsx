"use client";

/**
 * The deployed app's status card — one tab of the Preview/Code switcher in
 * page.tsx (CodePanel is the other, the IDE). A Vercel-style deployment
 * summary: a real captured screenshot on one side (deployment-thumbnail.tsx
 * — CaptureScreenshot's own headless-Chromium pod, not a live iframe) and
 * endpoint/status/instance metadata on the other. Deliberately not an
 * embedded iframe of the running site — explicit product decision
 * 2026-08-29: rendering the whole live app inline was more than this tab
 * is for, and a customer who wants to actually use the app opens it like
 * any other link. url preferentially comes from the session poll's own
 * live cluster read (app_endpoint — see GetKumbhaSession), falling back to
 * one parsed defensively out of the create_instance/deploy tool's own
 * plain-text summary in the activity feed for an older deployment plane —
 * see page.tsx's own comment on that ordering.
 *
 * No "deployed at" timestamp is shown: the session's own started_at is
 * when the BUILD started, not when the current instance's image was last
 * pushed (a redeploy swaps the same instance's image in place), and
 * labelling that value "Deployed" would be a guess dressed up as a fact.
 */

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { StatusPill } from "@/components/ui/status";
import type { InstanceStatus } from "@/lib/api/types";
import { DeploymentExtras } from "./deployment-extras";
import { DeploymentThumbnail } from "./deployment-thumbnail";

export function PreviewPanel({
  sessionId,
  url,
  instanceId,
  status,
  statusMessage,
  deployApproved,
}: {
  sessionId: string;
  url: string | null;
  /** The real compute instance behind this card — links straight to its
   *  Compute page (sizing, logs, metrics). Null before any deploy has
   *  recorded one, or when the console is talking to an older control
   *  plane that never returns app_instance_id at all. */
  instanceId: string | null;
  status?: InstanceStatus;
  statusMessage?: string;
  /** Feeds the Production Checklist's own two real, non-deployment items
   *  (see deployment-extras.tsx) — everything else on this tab derives
   *  from instanceId/url/status already. */
  deployApproved: boolean;
}) {
  if (!instanceId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <p className="text-muted-foreground text-sm">
          Your app will appear here once it&apos;s deployed.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <DeploymentThumbnail sessionId={sessionId} status={status} />

          <div className="hairline border-border rounded-lg p-5">
            <p className="text-muted-foreground text-xs">Deployment</p>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="identifier text-foreground mt-1 flex items-center gap-1.5 text-sm font-medium hover:underline"
              >
                {url.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            ) : (
              <p className="text-muted-foreground mt-1 text-sm">
                No endpoint yet — the instance has no exposed port.
              </p>
            )}

            <div className="hairline-t border-border mt-4 flex items-center justify-between pt-4 text-sm">
              <span className="text-muted-foreground">Status</span>
              {status ? (
                <StatusPill status={status} message={statusMessage} />
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </div>

            <div className="hairline-t border-border mt-3 flex items-center justify-between pt-3 text-sm">
              <span className="text-muted-foreground">Instance</span>
              <Link
                href={`/compute/${instanceId}`}
                className="identifier text-foreground hover:underline"
              >
                {instanceId}
              </Link>
            </div>

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="bg-foreground text-background mt-5 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium hover:opacity-90"
              >
                Open <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        <DeploymentExtras
          deployApproved={deployApproved}
          deployed={Boolean(instanceId)}
          hasEndpoint={Boolean(url)}
        />
      </div>
    </div>
  );
}
