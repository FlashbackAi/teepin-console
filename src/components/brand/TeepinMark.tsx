/**
 * Teepin — loop mark.
 *
 * Reconstructed as vector from the raster brand reference by measuring it:
 * stroke weight 13, lens corner radius 30, bars at y=36.5/59.5/82.5, and
 * diagonals running at exactly 45 degrees, crossing at the centre.
 *
 * The outline is ONE open path. The figure-eight is traversed starting just
 * past the crossing and ending just before it, so the break in the "under"
 * strand lands precisely where the "over" strand passes through. The knot
 * therefore needs no mask, no clip and no z-ordering — and because it is a
 * single path, it is trivially drawable via stroke-dashoffset, which is what
 * the reactor boot animation relies on.
 */

export const MARK_VIEWBOX = "0 0 320 120";
export const MARK_W = 320;
export const MARK_H = 120;
export const MARK_STROKE = 13;

/** Single self-avoiding path: right lobe, across the crossing, left lobe, back. */
export const MARK_PATH =
  "M 176.97 76.97 L 204.71 104.71 Q 213.5 113.5 225.93 113.5 L 283.5 113.5 " +
  "A 30 30 0 0 0 313.5 83.5 L 313.5 36.5 A 30 30 0 0 0 283.5 6.5 L 225.93 6.5 " +
  "Q 213.5 6.5 204.71 15.29 L 115.29 104.71 Q 106.5 113.5 94.07 113.5 L 36.5 113.5 " +
  "A 30 30 0 0 1 6.5 83.5 L 6.5 36.5 A 30 30 0 0 1 36.5 6.5 L 94.07 6.5 " +
  "Q 106.5 6.5 115.29 15.29 L 143.03 43.03";

/** Three bars per lens — the "E" strokes that give the mark its identity. */
export const MARK_BARS: ReadonlyArray<readonly [number, number, number, number]> = [
  [43.5, 36.5, 90, 36.5], [230, 36.5, 276.5, 36.5],
  [43.5, 59.5, 90, 59.5], [230, 59.5, 276.5, 59.5],
  [43.5, 82.5, 90, 82.5], [230, 82.5, 276.5, 82.5],
];

type Props = {
  /** Rendered width in px. Height follows the 8:3 aspect. */
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Accessible name. Omit to render decorative (aria-hidden). */
  title?: string;
};

export default function TeepinMark({
  size = MARK_W,
  className,
  strokeWidth = MARK_STROKE,
  title,
}: Props) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      width={size}
      height={(size * MARK_H) / MARK_W}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={MARK_PATH} />
        {MARK_BARS.map(([x1, y1, x2, y2]) => (
          <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
    </svg>
  );
}
