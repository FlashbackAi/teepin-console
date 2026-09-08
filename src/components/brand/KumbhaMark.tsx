/**
 * Kumbha — mark.
 *
 * A stroked "K" monogram, same visual grammar as TeepinMark (currentColor,
 * round caps/joins, no fill) rather than a generic lucide glyph — Kumbha is
 * a first-party, named product (KUMBHA-DESIGN.md), not an accessory
 * feature, so its nav/page identity gets its own mark instead of borrowing
 * an icon-font "sparkle" that means nothing on its own.
 *
 * 24x24 viewBox to match lucide's own convention exactly: it sits in the
 * same icon slots (sidebar nav, page badges) lucide icons do, so it must
 * scale and align identically alongside them.
 */

const STEM_X = 6;
const TOP_Y = 4;
const MID_Y = 12;
const BOTTOM_Y = 20;
const ARM_X = 18;

type Props = {
  /** Rendered width/height in px — the viewBox is square. */
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Accessible name. Omit to render decorative (aria-hidden), matching
   *  TeepinMark's own default — most call sites sit next to a visible
   *  label already. */
  title?: string;
};

export default function KumbhaMark({
  size = 24,
  className,
  strokeWidth = 2.25,
  title,
}: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
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
        <path d={`M ${STEM_X} ${TOP_Y} L ${STEM_X} ${BOTTOM_Y}`} />
        <path d={`M ${STEM_X} ${MID_Y} L ${ARM_X} ${TOP_Y}`} />
        <path d={`M ${STEM_X} ${MID_Y} L ${ARM_X} ${BOTTOM_Y}`} />
      </g>
    </svg>
  );
}
