/**
 * ANSI SGR (Select Graphic Rendition) color palette and a minimal parser.
 *
 * The palette is the single source of truth for "what color is red" —
 * shared by the terminal (which hands raw bytes to xterm.js, which
 * interprets escape codes itself and just needs these values for its
 * theme) and the logs viewer (which has no terminal emulator underneath
 * it and must parse escape sequences itself to render colored spans;
 * previously it rendered them as literal garbage bytes inside a plain
 * `<pre>`).
 *
 * Deliberately NOT the console's own neutral no-accent tokens (see
 * globals.css) — programs emit these 16 colors on purpose (`ls --color`,
 * `kubectl`, prompts), and remapping them onto the app's palette would
 * make that output unreadable.
 */
export const ANSI = {
  black: "#1a1a1a",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#d19a66",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#dcdfe4",
  brightBlack: "#5c6370",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#d19a66",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
} as const;

const FG_CODES: Record<number, keyof typeof ANSI> = {
  30: "black",
  31: "red",
  32: "green",
  33: "yellow",
  34: "blue",
  35: "magenta",
  36: "cyan",
  37: "white",
  90: "brightBlack",
  91: "brightRed",
  92: "brightGreen",
  93: "brightYellow",
  94: "brightBlue",
  95: "brightMagenta",
  96: "brightCyan",
  97: "brightWhite",
};

export type AnsiSegment = {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
};

// Matches a full CSI (Control Sequence Introducer) escape: ESC [ ... letter.
// Broader than just SGR ("m") on purpose — a code this doesn't style (e.g.
// cursor movement) still needs to be STRIPPED, not left as visible garbage,
// which was the original bug this module fixes.
const CSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * Splits text containing ANSI SGR color codes into styled segments,
 * stripping every other escape sequence cleanly rather than leaving it
 * as visible garbage. Supports the 16 standard/bright foreground colors,
 * bold (1), dim (2), and reset (0) — the common subset real-world
 * container log output actually uses. 256-color (`38;5;n`) and truecolor
 * (`38;2;r;g;b`) codes are recognized as "consume and reset color" rather
 * than rendered, since a handful of extra palette values isn't worth the
 * complexity for logs (as opposed to the terminal, which delegates all of
 * this to xterm.js and never needs to parse it at all).
 */
export function parseAnsi(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let color: string | undefined;
  let bold = false;
  let dim = false;
  let lastIndex = 0;

  CSI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CSI_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      if (chunk) segments.push({ text: chunk, color, bold, dim });
    }
    lastIndex = CSI_RE.lastIndex;

    // Only SGR ("m") sequences carry color/style; every other CSI code
    // (cursor movement, erase, etc.) is stripped with no style change.
    if (match[0].endsWith("m")) {
      const params = match[0].slice(2, -1).split(";").filter(Boolean).map(Number);
      const codes = params.length > 0 ? params : [0];
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        if (code === 0) {
          color = undefined;
          bold = false;
          dim = false;
        } else if (code === 1) {
          bold = true;
        } else if (code === 2) {
          dim = true;
        } else if (code === 22) {
          bold = false;
          dim = false;
        } else if (code === 39) {
          color = undefined;
        } else if (code === 38 || code === 48) {
          // 256-color / truecolor — consume the parameters that follow
          // without attempting to render them (see doc comment above).
          if (codes[i + 1] === 5) i += 2;
          else if (codes[i + 1] === 2) i += 4;
        } else if (FG_CODES[code]) {
          color = ANSI[FG_CODES[code]];
        }
      }
    }
  }

  const rest = text.slice(lastIndex);
  if (rest) segments.push({ text: rest, color, bold, dim });

  return segments;
}
