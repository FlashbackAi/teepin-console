import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes, with later classes winning conflicts.
 *
 * Without twMerge, `cn("px-2", "px-4")` emits both and the winner
 * depends on stylesheet order rather than call order — which makes
 * component variants unpredictable to override.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a cost in USD.
 *
 * Four decimal places because GPU billing is metered in fractions of a
 * cent per hour, and rounding to 2dp would show "$0.00" for real usage —
 * a customer seeing zero for work they were charged for loses trust in
 * every other number on the page.
 */
export function formatCost(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

/** Format an hourly rate. Sub-cent rates (common for CPU) keep more decimals
 *  so the displayed number equals the billed number — never rounds $0.008 to
 *  $0.01, which would recreate a quote-vs-bill mismatch. */
export function formatRate(perHour: number): string {
  if (perHour > 0 && perHour < 0.01) return `$${perHour.toFixed(4)}/hr`;
  return `$${perHour.toFixed(2)}/hr`;
}

/** Hours in an average month (365.25/12 × 24), for hourly→monthly display.
 *  Metering is hourly; monthly is purely a readable presentation of the same
 *  rate — the market convention for cheap CPU (Akash et al.). */
const HOURS_PER_MONTH = 730;

/** Format an hourly rate as an approximate monthly cost, e.g. "~$5.84/mo".
 *  Used for CPU tiers whose hourly price is sub-cent and unreadable. */
export function formatMonthly(perHour: number): string {
  return `~$${(perHour * HOURS_PER_MONTH).toFixed(2)}/mo`;
}

/**
 * Format a usage line's quantity for its unit — the "Usage by project"
 * table (billing/page.tsx). Token counts are large, discrete counts (an
 * LLM turn's input+output tokens): a raw "39608889.0000" both applies
 * decimal precision that doesn't mean anything for a token count and is
 * unreadable at a glance, so tokens use compact notation ("39.6M")
 * instead, the convention every usage-based LLM dashboard already uses.
 * Every other unit (hours, GB-month, ...) keeps fixed 4-decimal
 * precision, where the fraction is real and meaningful — GPU billing
 * metered in fractions of a cent per hour needs it, same reasoning as
 * formatCost's own 4dp branch.
 */
export function formatQuantity(quantity: number, unit: string): string {
  if (unit === "tokens") {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(quantity);
  }
  return quantity.toFixed(4);
}

/**
 * Relative time, for "created 4 minutes ago".
 *
 * Absolute timestamps are better for anything a customer may need to
 * quote in a support ticket, so callers should pair this with a `title`
 * attribute carrying the exact time.
 */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";

  const seconds = Math.floor((Date.now() - then) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Full timestamp for tooltips and support tickets. */
export function fullTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

/**
 * Format an account number as 1234-5678-90.
 *
 * Grouped like a card number because customers read these aloud to
 * support and transcribe them into tickets.
 */
export function formatAccountNumber(raw: string): string {
  if (raw.length !== 10) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/**
 * Strips the registry host off an image reference for display —
 * `880254196251.dkr.ecr.us-east-1.amazonaws.com/teepin/kumbha-builds-dev:abc123`
 * becomes `teepin/kumbha-builds-dev:abc123`. Found live 2026-08-26: the
 * raw ECR-hosted reference was showing an AWS account ID and region on
 * an instance detail page a customer sees — an implementation detail of
 * where TEEPIN's OWN registry happens to be hosted today, not something
 * that should leak into a customer-facing surface, and not something to
 * couple the UI to (self-hosted Harbor/Kaniko is a real possibility
 * later, per the same conversation).
 *
 * Uses the same heuristic Docker's own reference parser uses to decide
 * whether the first path segment is a registry host at all, rather than
 * an image name: it counts as a host only if it contains a `.` or `:`,
 * or is literally `localhost` — which is exactly what lets this leave
 * `nginx:alpine` (Docker Hub, no host segment) and any other
 * host-less reference alone, while still generalizing to Harbor's own
 * eventual `registry.teepin.cloud/...` references, not just ECR's.
 * The FULL reference (this function's input) is what a deploy/build
 * actually uses — this is a display-only transform, never applied to
 * anything sent back to an API.
 */
export function formatImageForDisplay(image: string): string {
  const slash = image.indexOf("/");
  if (slash === -1) return image; // no path at all — nothing to strip
  const first = image.slice(0, slash);
  const looksLikeHost = first === "localhost" || first.includes(".") || first.includes(":");
  return looksLikeHost ? image.slice(slash + 1) : image;
}

/**
 * Trigger a browser download by navigating to a URL via a synthetic
 * link click.
 *
 * Used for presigned S3 URLs, which the browser must NAVIGATE to (a
 * cross-origin fetch into S3 is blocked by CORS). A clicked <a> is a
 * navigation, not a fetch, so it is not subject to CORS. The link is not
 * given a `download` attribute: that attribute is ignored cross-origin
 * anyway, and the presigned URL already asks S3 for a
 * Content-Disposition: attachment response, which is what makes the
 * browser save the file rather than open it in the tab.
 */
export function triggerDownload(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
