import { cn } from "@/lib/utils";
import type { InstanceStatus } from "@/lib/api/types";

/**
 * Instance status indicator.
 *
 * This is the ONLY colour on screen. Everything else in the console is
 * neutral, so the status dot carries all of the visual signal — which is
 * the point: at 3am during an incident, the single question is whether
 * something is running or broken, and it should be answerable from
 * across the room.
 *
 * A dot plus a word, never colour alone: roughly 1 in 12 men has some
 * form of colour vision deficiency, and red/green is the most common
 * confusion. The word is not decoration.
 */

const STATUS_STYLES: Record<
  InstanceStatus,
  { dot: string; label: string }
> = {
  running: { dot: "bg-success", label: "Running" },
  // Pending is deliberately neutral rather than amber: it is the normal
  // state of a healthy instance that is still pulling its image, and
  // colouring it as a warning trains customers to ignore warnings.
  pending: { dot: "bg-muted-foreground animate-pulse", label: "Pending" },
  failed: { dot: "bg-destructive", label: "Failed" },
  terminated: { dot: "bg-muted-foreground/50", label: "Terminated" },
};

export function StatusDot({ status }: { status: InstanceStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span
      className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", style.dot)}
      aria-hidden
    />
  );
}

export function StatusPill({
  status,
  message,
}: {
  status: InstanceStatus;
  /** The reason a non-running instance is in that state. */
  message?: string;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;

  return (
    <span className="inline-flex items-center gap-1.5" title={message}>
      <StatusDot status={status} />
      <span className="text-foreground">{style.label}</span>
      {/* A failure the customer cannot diagnose is a support ticket.
          "manifest unknown" tells them their image tag is wrong. */}
      {message && status === "failed" && (
        <span className="text-muted-foreground truncate">— {message}</span>
      )}
    </span>
  );
}
