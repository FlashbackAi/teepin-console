import { cn } from "@/lib/utils";

/**
 * A thin determinate progress bar — used for upload progress, where
 * Shelby's measured throughput makes showing real progress load-bearing,
 * not decorative (see the upload dropzone's own doc comment).
 */
export function Progress({
  value,
  className,
}: {
  /** 0-100. Values outside that range are clamped. */
  value: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "bg-muted h-1.5 w-full overflow-hidden rounded-full",
        className,
      )}
    >
      <div
        className="bg-foreground h-full rounded-full transition-[width] duration-150"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
