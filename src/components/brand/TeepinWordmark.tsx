/**
 * Teepin — full wordmark. T + loop mark + PIN.
 *
 * Letterforms measured off the raster reference: every stroke carries the same
 * 13-unit weight with round caps, and letters span centreline y 13.5 -> 103.5.
 * The loop mark sits at x=126 and is the exact same path as TeepinMark, so the
 * two assets can never drift apart.
 */

import {
  MARK_PATH,
  MARK_BARS,
  MARK_STROKE,
} from "./TeepinMark";

const VIEWBOX_W = 744;
const VIEWBOX_H = 120;
const MARK_X = 126;

const CAP_T = 13.5;
const CAP_B = 103.5;

/* Letter paths in their own local space; placed by translate below. */
const LETTERS: ReadonlyArray<readonly [string, number]> = [
  // T — full-width top bar + centred stem
  [`M 6.5 ${CAP_T} L 106.5 ${CAP_T} M 56.5 ${CAP_T} L 56.5 ${CAP_B}`, 0],
  // P — full-height stem + stadium bowl closing on the middle bar
  [
    `M 6.5 ${CAP_T} L 6.5 ${CAP_B}` +
      ` M 6.5 ${CAP_T} L 83.5 ${CAP_T} A 20 20 0 0 1 103.5 33.5` +
      ` L 103.5 41.5 A 20 20 0 0 1 83.5 61.5 L 6.5 61.5`,
    466,
  ],
  // I
  [`M 6.5 ${CAP_T} L 6.5 ${CAP_B}`, 597],
  // N — two verticals + straight diagonal
  [
    `M 6.5 ${CAP_T} L 6.5 ${CAP_B} M 6.5 ${CAP_T} L 104 ${CAP_B}` +
      ` M 104 ${CAP_T} L 104 ${CAP_B}`,
    632,
  ],
];

type Props = {
  /** Rendered height in px. Width follows the 6.2:1 aspect. */
  height?: number;
  className?: string;
  title?: string;
};

export default function TeepinWordmark({
  height = 24,
  className,
  title = "Teepin",
}: Props) {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      height={height}
      width={(height * VIEWBOX_W) / VIEWBOX_H}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={MARK_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {LETTERS.map(([d, x]) => (
          <path key={x} transform={`translate(${x} 0)`} d={d} />
        ))}
        <g transform={`translate(${MARK_X} 0)`}>
          <path d={MARK_PATH} />
          {MARK_BARS.map(([x1, y1, x2, y2]) => (
            <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
      </g>
    </svg>
  );
}
