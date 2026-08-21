// One-off render of the new TeepinWordmark to a PNG for the invoice PDF
// letterhead (teepin-core/pkg/billing/pdf embeds a raster asset via
// go:embed — gofpdf draws images, not SVG, so this can't be the live
// component). Path data copied verbatim from src/components/brand/
// TeepinMark.tsx and TeepinWordmark.tsx; keep this in sync if those change.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const VIEWBOX_W = 744;
const VIEWBOX_H = 120;
const MARK_X = 126;
const MARK_STROKE = 13;

const CAP_T = 13.5;
const CAP_B = 103.5;

const LETTERS = [
  [`M 6.5 ${CAP_T} L 106.5 ${CAP_T} M 56.5 ${CAP_T} L 56.5 ${CAP_B}`, 0],
  [
    `M 6.5 ${CAP_T} L 6.5 ${CAP_B}` +
      ` M 6.5 ${CAP_T} L 83.5 ${CAP_T} A 20 20 0 0 1 103.5 33.5` +
      ` L 103.5 41.5 A 20 20 0 0 1 83.5 61.5 L 6.5 61.5`,
    466,
  ],
  [`M 6.5 ${CAP_T} L 6.5 ${CAP_B}`, 597],
  [
    `M 6.5 ${CAP_T} L 6.5 ${CAP_B} M 6.5 ${CAP_T} L 104 ${CAP_B}` +
      ` M 104 ${CAP_T} L 104 ${CAP_B}`,
    632,
  ],
];

const MARK_PATH =
  "M 176.97 76.97 L 204.71 104.71 Q 213.5 113.5 225.93 113.5 L 283.5 113.5 " +
  "A 30 30 0 0 0 313.5 83.5 L 313.5 36.5 A 30 30 0 0 0 283.5 6.5 L 225.93 6.5 " +
  "Q 213.5 6.5 204.71 15.29 L 115.29 104.71 Q 106.5 113.5 94.07 113.5 L 36.5 113.5 " +
  "A 30 30 0 0 1 6.5 83.5 L 6.5 36.5 A 30 30 0 0 1 36.5 6.5 L 94.07 6.5 " +
  "Q 106.5 6.5 115.29 15.29 L 143.03 43.03";

const MARK_BARS = [
  [43.5, 36.5, 90, 36.5], [230, 36.5, 276.5, 36.5],
  [43.5, 59.5, 90, 59.5], [230, 59.5, 276.5, 59.5],
  [43.5, 82.5, 90, 82.5], [230, 82.5, 276.5, 82.5],
];

const letterPaths = LETTERS.map(
  ([d, x]) => `<path transform="translate(${x} 0)" d="${d}" />`,
).join("\n");
const markBars = MARK_BARS.map(
  ([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`,
).join("\n");

const svg = `<svg viewBox="0 0 ${VIEWBOX_W} ${VIEWBOX_H}" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="#000000" stroke-width="${MARK_STROKE}" stroke-linecap="round" stroke-linejoin="round">
    ${letterPaths}
    <g transform="translate(${MARK_X} 0)">
      <path d="${MARK_PATH}" />
      ${markBars}
    </g>
  </g>
</svg>`;

// Rendered at 2700x435 — a bit above the old asset's 2218x709 canvas so
// the letterhead stays crisp at print resolution despite the new mark's
// wider aspect (744:120 vs the old 2218:709).
const OUT_W = 2700;
const OUT_H = Math.round((OUT_W * VIEWBOX_H) / VIEWBOX_W);

const out = process.argv[2];
if (!out) {
  console.error("usage: node render-invoice-logo.mjs <output.png>");
  process.exit(1);
}

await sharp(Buffer.from(svg), { density: 300 })
  .resize(OUT_W, OUT_H)
  .png()
  .toFile(out);

writeFileSync(out.replace(/\.png$/, ".viewbox.txt"), `${VIEWBOX_W}x${VIEWBOX_H}\n`);
console.log(`wrote ${out} (${OUT_W}x${OUT_H})`);
