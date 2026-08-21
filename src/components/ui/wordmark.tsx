import TeepinWordmark from "@/components/brand/TeepinWordmark";
import { cn } from "@/lib/utils";

/**
 * TEEPIN wordmark — the T-loop-PIN vector mark, stroked in `currentColor`.
 *
 * A single asset rather than the old light/dark PNG pair: the mark has no
 * fill of its own (letters and lens bars are all stroke), so there is no
 * colour to flatten or drift by theme — it simply follows `text-foreground`
 * like any other text on the page, correct in both themes with no swap.
 */
export function Wordmark({
  height = 32,
  className,
}: {
  /** Rendered height in px. Width follows the mark's own aspect. */
  height?: number;
  className?: string;
}) {
  return (
    <TeepinWordmark
      height={height}
      className={cn("text-foreground", className)}
      title="Teepin"
    />
  );
}
