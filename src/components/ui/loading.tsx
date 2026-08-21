import TeepinLoader from "@/components/brand/TeepinLoader";
import { cn } from "@/lib/utils";

/**
 * Standard loading placeholder — the Teepin mark's orbiting pulse,
 * centered, at a size that reads on its own with no caption. One shared
 * component rather than each page repeating the icon markup, so every
 * loading state in the app looks and behaves identically.
 *
 * No "Loading…" text: the mark is the largest thing in its container and
 * the only thing moving, so it doesn't need a caption to be understood —
 * a word next to it would be redundant, not clarifying. It still
 * announces "Loading" to screen readers via TeepinLoader's own
 * role="status", just nothing printed on screen.
 */
export function Loading({
  className,
  size = 160,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <TeepinLoader size={size} />
    </div>
  );
}
