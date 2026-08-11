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

/** Format an hourly rate. */
export function formatRate(perHour: number): string {
  return `$${perHour.toFixed(2)}/hr`;
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
