import { cn } from "@/lib/utils";
import type { Environment, Project } from "@/lib/api/types";

/**
 * Environment badge — DEV / STAGING / PROD.
 *
 * Reads the stored `environment` field. Projects created before that
 * column existed have none, so their name is used as a fallback guess —
 * which is why the guess is conservative: an unrecognised name gets NO
 * badge rather than a wrong one. Mislabelling a production project "DEV"
 * would be worse than showing nothing, since the badge exists precisely
 * to make someone hesitate before a destructive action.
 */

export type { Environment };

export function environmentOf(project: Project): Environment | null {
  // What the customer actually declared always wins.
  if (project.environment) return project.environment;

  const name = `${project.name} ${project.slug}`.toLowerCase();

  if (/\b(prod|production|live)\b/.test(name)) return "prod";
  if (/\b(stag|staging|uat|preprod|pre-prod)\b/.test(name)) return "staging";
  if (/\b(dev|development|test|testing|sandbox|scratch)\b/.test(name)) {
    return "dev";
  }
  return null;
}

const STYLES: Record<Environment, string> = {
  // Production is the one that must catch the eye before a destructive
  // action; the others are quiet.
  prod: "border-warning/40 text-warning",
  staging: "border-border text-muted-foreground",
  dev: "border-success/40 text-success",
};

const LABELS: Record<Environment, string> = {
  prod: "PROD",
  staging: "STAGING",
  dev: "DEV",
};

export function EnvironmentBadge({
  project,
  environment,
  className,
}: {
  project?: Project;
  environment?: Environment | null;
  className?: string;
}) {
  const env = environment ?? (project ? environmentOf(project) : null);
  if (!env) return null;

  return (
    <span
      className={cn(
        "hairline shrink-0 rounded px-1 py-0.5 text-[10px] leading-none font-medium tracking-wide",
        STYLES[env],
        className,
      )}
    >
      {LABELS[env]}
    </span>
  );
}
