"use client";

/**
 * The Production Checklist / Observability / Analytics row Vercel shows
 * under a deployment's own summary — replicated here for the same reason
 * Vercel has it: a short, honest list of "what's left" plus a preview of
 * what deeper platform features would show once built.
 *
 * Every item here is either backed by something real in this session's own
 * data, or explicitly marked "Coming soon" — never a clickable control that
 * does nothing, and never fabricated metrics. GetInstanceMetrics
 * (pkg/api/server.go) is itself an honest 501 today ("returning made-up
 * numbers to customers is worse than admitting the gap") — the
 * Observability and Analytics cards here follow that exact same rule:
 * their empty states say so plainly rather than inventing a sparkline.
 *
 * Git connection is deliberately absent from the checklist — Kumbha builds
 * are agent-authored inside its own workspace, not connected to an
 * external repo, so "Connect Git Repository" has no Kumbha equivalent at
 * all (2026-08-29 product decision).
 */

import {
  Activity,
  BarChart3,
  Check,
  ClipboardCheck,
  Globe,
  MonitorPlay,
  Rocket,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface ChecklistItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
  comingSoon?: boolean;
}

export function DeploymentExtras({
  deployApproved,
  deployed,
  hasEndpoint,
}: {
  deployApproved: boolean;
  deployed: boolean;
  hasEndpoint: boolean;
}) {
  const items: ChecklistItem[] = [
    { key: "approve", label: "Approve deployment plan", icon: ClipboardCheck, done: deployApproved },
    { key: "deploy", label: "Deploy your app", icon: Rocket, done: deployed },
    { key: "preview", label: "Preview your deployment", icon: MonitorPlay, done: hasEndpoint },
    { key: "domain", label: "Add a custom domain", icon: Globe, done: false, comingSoon: true },
    { key: "analytics", label: "Enable Web Analytics", icon: BarChart3, done: false, comingSoon: true },
    { key: "observability", label: "Enable Observability", icon: Activity, done: false, comingSoon: true },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="hairline border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-sm font-medium">Production Checklist</h3>
          <span className="bg-muted text-muted-foreground tabular rounded-full px-2 py-0.5 text-xs">
            {doneCount}/{items.length}
          </span>
        </div>
        <ul className="mt-3 flex flex-col gap-1">
          {items.map((item) => (
            <li
              key={item.key}
              className={cn(
                "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                item.done && "bg-muted/50",
                item.comingSoon && "opacity-60",
              )}
            >
              <item.icon className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span
                className={cn(
                  "flex-1",
                  item.done ? "text-muted-foreground line-through" : "text-foreground",
                )}
              >
                {item.label}
              </span>
              {item.done ? (
                <Check className="text-success mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : item.comingSoon ? (
                <span className="text-muted-foreground mt-0.5 shrink-0 text-[11px] whitespace-nowrap">
                  Coming soon
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <EmptyFeatureCard
        title="Observability"
        icon={Activity}
        description="Per-instance request rate, latency, and error-rate metrics — not available yet. Real numbers arrive with the Prometheus/DCGM integration milestone, not before."
      />
      <EmptyFeatureCard
        title="Analytics"
        icon={BarChart3}
        description="Track visitors and page views for your deployed app."
      />
    </div>
  );
}

function EmptyFeatureCard({
  title,
  icon: Icon,
  description,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}) {
  return (
    <div className="hairline border-border rounded-lg p-4">
      <h3 className="text-foreground text-sm font-medium">{title}</h3>
      <div className="mt-3 flex flex-col items-center gap-2 py-4 text-center">
        <Icon className="text-muted-foreground h-6 w-6" />
        <p className="text-muted-foreground text-xs">{description}</p>
        <span className="text-muted-foreground hairline border-border mt-1 cursor-not-allowed rounded-md px-3 py-1.5 text-xs">
          Coming soon
        </span>
      </div>
    </div>
  );
}
