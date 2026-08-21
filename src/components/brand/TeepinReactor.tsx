"use client";

/**
 * Teepin — hero centerpiece (SVG, anime.js v4).
 *
 * The Teepin loop mark, booted like an instrument coming online:
 *
 *   Boot — the outline traces itself around the figure-eight at a steady
 *          hand-drawn pace (no rotation), the six lens bars draw in from
 *          the crossing outward, then scaffold rings, cardinal ticks and
 *          the curved serial text register around it.
 *   Infinity pulse — once booted, a short HUD-colored segment orbits the
 *          outline forever. The path begins and ends at the crossing, so
 *          each lap re-enters where the last one left off and the pulse
 *          reads as a continuous circuit of the infinity loop.
 *   Ambient — halo breathes, the mark scales gently, the serial-text ring
 *          rotates slowly.
 *   Phase — strokes use var(--color-ink) / var(--color-steel), so the
 *          hero's data-phase="black" → paper crossfade recolors the mark.
 *   Reduced-motion — snaps to final state, skips all loops.
 */

import { useLayoutEffect, useRef } from "react";
import { animate, createTimeline, stagger, svg, utils } from "animejs";
import { prefersReducedMotion } from "@/lib/motion";
import { MARK_PATH, MARK_BARS, MARK_STROKE, MARK_W, MARK_H } from "./TeepinMark";

const VB = 400;
const CX = VB / 2;
const CY = VB / 2;

// The mark rendered at 250/400 of the stage width — clearly the centerpiece,
// with enough margin for the scaffold rings to read around it.
const MARK_RENDER_W = 250;
const MARK_SCALE = MARK_RENDER_W / MARK_W;
const MARK_TX = CX - (MARK_W / 2) * MARK_SCALE;
const MARK_TY = CY - (MARK_H / 2) * MARK_SCALE;

const SERIAL_TEXT =
  "TEEPIN · CLOUD · SERIES·T-01 · PORTABLE BY DESIGN · PRICED HONESTLY · ";

// Cardinal register ticks just outside the solid ring (r=150).
const TICKS = [
  { x1: CX, y1: CY - 164, x2: CX, y2: CY - 154 },
  { x1: CX + 154, y1: CY, x2: CX + 164, y2: CY },
  { x1: CX, y1: CY + 154, x2: CX, y2: CY + 164 },
  { x1: CX - 164, y1: CY, x2: CX - 154, y2: CY },
];

type Props = {
  size?: number;
  className?: string;
};

export default function TeepinReactor({ size = 640, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const q = (sel: string) =>
      root.querySelectorAll(sel) as NodeListOf<Element>;

    const markGroup = q(".tr-mark")[0] as SVGElement | undefined;
    const halo = q(".tr-halo")[0] as SVGElement | undefined;
    const rings = Array.from(q(".tr-ring")) as SVGElement[];
    const ticks = Array.from(q(".tr-tick")) as SVGElement[];
    const textRot = q(".tr-text-rot")[0] as SVGElement | undefined;
    const textEl = q(".tr-text")[0] as SVGElement | undefined;
    const reduced = prefersReducedMotion();

    // Drawables: the outline is ONE open path (the gap falls where the other
    // strand crosses), so a plain 0→1 draw traces the figure-eight correctly.
    const outline = svg.createDrawable(q(".tr-outline"), 0, 0);
    const bars = svg.createDrawable(q(".tr-bar"), 0, 0);
    const pulse = svg.createDrawable(q(".tr-pulse"), 0, 0);

    if (reduced) {
      utils.set(outline, { draw: "0 1" });
      utils.set(bars, { draw: "0 1" });
      utils.set(pulse, { draw: "0 0" });
      if (markGroup) utils.set(markGroup, { scale: 1 });
      if (halo) utils.set(halo, { opacity: 0.2 });
      utils.set([...rings, ...ticks], { opacity: 1, scale: 1 });
      if (textEl) utils.set(textEl, { opacity: 0.5 });
      return;
    }

    // ── Initial states ──
    if (markGroup) {
      utils.set(markGroup, {
        scale: 0.9,
        transformOrigin: `${CX}px ${CY}px`,
      });
    }
    if (halo) utils.set(halo, { opacity: 0 });
    utils.set(rings, { opacity: 0, scale: 0.92 });
    utils.set(ticks, { opacity: 0 });
    if (textEl) utils.set(textEl, { opacity: 0 });

    // ── Boot ── fits inside the hero's black window (~0–3000ms).
    const tl = createTimeline({ defaults: { ease: "outQuart" } });

    // The infinity trace — steady pace, like a pen following the loop.
    tl.add(
      outline,
      { draw: ["0 0", "0 1"], duration: 2000, ease: "inOutSine" },
      250,
    );
    if (markGroup) {
      tl.add(
        markGroup,
        { scale: [0.9, 1], duration: 2200, ease: "outQuart" },
        250,
      );
    }
    // Lens bars — draw in from the crossing outward.
    tl.add(
      bars,
      {
        draw: ["0 0", "0 1"],
        duration: 420,
        ease: "outExpo",
        delay: stagger(70, { from: "center" }),
      },
      2050,
    );
    if (rings.length) {
      tl.add(
        rings,
        {
          opacity: [0, 1],
          scale: [0.92, 1],
          duration: 900,
          ease: "outExpo",
          delay: stagger(140),
          transformOrigin: `${CX}px ${CY}px`,
        },
        900,
      );
    }
    if (ticks.length) {
      tl.add(
        ticks,
        { opacity: [0, 1], duration: 400, delay: stagger(90) },
        1600,
      );
    }
    if (textEl) {
      tl.add(textEl, { opacity: [0, 0.5], duration: 700 }, 2300);
    }
    if (halo) {
      tl.add(halo, { opacity: [0, 0.2], duration: 900 }, 2400);
    }

    // ── Infinity pulse — orbits the outline forever ──
    const pulseAnim = animate(pulse, {
      draw: ["0 0.1", "0.9 1"],
      duration: 3200,
      ease: "linear",
      loop: true,
      delay: 2900,
    });

    // ── Ambient loops ──
    let haloAnim: ReturnType<typeof animate> | null = null;
    if (halo) {
      haloAnim = animate(halo, {
        opacity: [0.14, 0.26, 0.14],
        duration: 3800,
        ease: "inOutSine",
        loop: true,
        delay: 3400,
      });
    }
    let breathAnim: ReturnType<typeof animate> | null = null;
    if (markGroup) {
      breathAnim = animate(markGroup, {
        scale: [1, 1.025, 1],
        duration: 3800,
        ease: "inOutSine",
        loop: true,
        delay: 3400,
      });
    }
    let textAnim: ReturnType<typeof animate> | null = null;
    if (textRot) {
      utils.set(textRot, { transformOrigin: `${CX}px ${CY}px` });
      textAnim = animate(textRot, {
        rotate: 360,
        duration: 140000,
        ease: "linear",
        loop: true,
      });
    }

    return () => {
      tl.pause();
      pulseAnim.pause();
      haloAnim?.pause();
      breathAnim?.pause();
      textAnim?.pause();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ width: size, height: size, position: "relative" }}
      aria-hidden="true"
    >
      <svg viewBox={`0 0 ${VB} ${VB}`} width={size} height={size} fill="none">
        <defs>
          <filter id="tr-halo-blur" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          {/* Circle path the serial text rides on */}
          <path
            id="tr-text-circle"
            d={`M ${CX} ${CY - 163} a 163 163 0 1 1 -0.01 0`}
            fill="none"
          />
        </defs>

        {/* Halo — soft aura behind the mark */}
        <circle
          className="tr-halo"
          cx={CX}
          cy={CY}
          r={120}
          fill="var(--color-hud)"
          filter="url(#tr-halo-blur)"
        />

        {/* Scaffold rings — engineering-drawing register around the mark */}
        <circle
          className="tr-ring"
          cx={CX}
          cy={CY}
          r={150}
          stroke="var(--color-steel)"
          strokeOpacity="0.35"
          strokeWidth="1"
        />
        <circle
          className="tr-ring"
          cx={CX}
          cy={CY}
          r={178}
          stroke="var(--color-steel)"
          strokeOpacity="0.25"
          strokeWidth="0.8"
          strokeDasharray="2 7"
        />

        {/* Cardinal register ticks */}
        {TICKS.map((t, i) => (
          <line
            key={`tr-tick-${i}`}
            className="tr-tick"
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke="var(--color-steel)"
            strokeOpacity="0.55"
            strokeWidth="1"
          />
        ))}

        {/* Curved serial text — rotates forever */}
        <g className="tr-text-rot">
          <text
            className="tr-text"
            style={{
              fontSize: "9.5px",
              letterSpacing: "0.32em",
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
            }}
            fill="var(--color-steel)"
          >
            <textPath href="#tr-text-circle" startOffset="0%">
              {SERIAL_TEXT}
            </textPath>
          </text>
        </g>

        {/* The mark — traces itself in, then carries the orbiting pulse */}
        <g className="tr-mark">
          <g transform={`translate(${MARK_TX} ${MARK_TY}) scale(${MARK_SCALE})`}>
            <path
              className="tr-outline"
              d={MARK_PATH}
              stroke="var(--color-ink)"
              strokeWidth={MARK_STROKE}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {MARK_BARS.map(([x1, y1, x2, y2]) => (
              <line
                key={`tr-bar-${x1}-${y1}`}
                className="tr-bar"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--color-ink)"
                strokeWidth={MARK_STROKE}
                strokeLinecap="round"
              />
            ))}
            {/* Infinity pulse — a short bright segment riding the outline */}
            <path
              className="tr-pulse"
              d={MARK_PATH}
              stroke="var(--color-hud-deep)"
              strokeWidth={MARK_STROKE * 0.55}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
