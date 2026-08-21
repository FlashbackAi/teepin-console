"use client";

/**
 * Teepin — loading indicator.
 *
 * A lean cut of TeepinReactor's boot animation, built for a different job:
 * that component is a one-time hero centerpiece (scale up from oversize,
 * trace in over ~2s, then settle); this one gets mounted and unmounted
 * constantly — a button spinner, a table's loading row, a page shell — so
 * it must read as "loading" on the very first frame, not seconds in. No
 * scale-up boot, no scaffold rings/ticks/serial text (marketing flourishes
 * that would be dead weight repeated dozens of times on a busy page): the
 * outline and lens bars are always fully drawn at low opacity as a static
 * track, and a short bright segment orbits the outline forever on top of
 * it — the same "infinity pulse" mechanism TeepinReactor uses for its own
 * ambient loop, just without everything staged before it.
 */

import { useLayoutEffect, useRef } from "react";
import { animate, svg, utils } from "animejs";
import { prefersReducedMotion } from "@/lib/motion";
import {
  MARK_PATH,
  MARK_BARS,
  MARK_STROKE,
  MARK_VIEWBOX,
  MARK_W,
  MARK_H,
} from "./TeepinMark";

type Props = {
  /** Rendered width in px. Height follows the mark's 8:3 aspect. */
  size?: number;
  className?: string;
  /** Accessible label, announced via role="status". Pass "" when a
   *  sibling element already says "Loading…" — otherwise a screen reader
   *  announces it twice. */
  label?: string;
};

export default function TeepinLoader({
  size = 20,
  className,
  label = "Loading",
}: Props) {
  const rootRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const outline = svg.createDrawable(root.querySelectorAll(".tl-outline"), 0, 0);
    const bars = svg.createDrawable(root.querySelectorAll(".tl-bar"), 0, 0);
    const pulse = svg.createDrawable(root.querySelectorAll(".tl-pulse"), 0, 0);

    // Track is always fully drawn — it's the static "off" state a spinner
    // needs, not something that benefits from tracing in on every mount.
    utils.set(outline, { draw: "0 1" });
    utils.set(bars, { draw: "0 1" });

    if (prefersReducedMotion()) {
      utils.set(pulse, { draw: "0 0" });
      return;
    }

    utils.set(pulse, { draw: "0 0.1" });
    const pulseAnim = animate(pulse, {
      draw: ["0 0.1", "0.9 1"],
      duration: 1600,
      ease: "linear",
      loop: true,
    });

    return () => {
      pulseAnim.pause();
    };
  }, []);

  return (
    <svg
      ref={rootRef}
      viewBox={MARK_VIEWBOX}
      width={size}
      height={(size * MARK_H) / MARK_W}
      className={className}
      role={label ? "status" : undefined}
      aria-live={label ? "polite" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Track — the full figure-eight, dimmed. */}
        <path
          className="tl-outline"
          d={MARK_PATH}
          stroke="var(--color-ink)"
          strokeOpacity={0.25}
          strokeWidth={MARK_STROKE}
        />
        {MARK_BARS.map(([x1, y1, x2, y2]) => (
          <line
            key={`${x1}-${y1}`}
            className="tl-bar"
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--color-ink)"
            strokeOpacity={0.25}
            strokeWidth={MARK_STROKE}
          />
        ))}
        {/* Pulse — a short bright segment orbiting the track forever. */}
        <path
          className="tl-pulse"
          d={MARK_PATH}
          stroke="var(--color-hud-deep)"
          strokeWidth={MARK_STROKE * 0.62}
        />
      </g>
    </svg>
  );
}
