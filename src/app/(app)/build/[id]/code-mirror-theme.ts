/**
 * The IDE's CodeMirror theme — built from this console's own CSS custom
 * properties (globals.css) rather than a stock CodeMirror theme, per the
 * "apply our theme" instruction. Reads `var(--color-*)` directly, so it
 * tracks the console's light/dark mode automatically with no separate
 * dark variant to maintain here.
 */

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const cv = (name: string) => `var(--color-${name})`;

const theme = EditorView.theme(
  {
    "&": {
      color: cv("foreground"),
      backgroundColor: cv("background"),
      fontSize: "13px",
      height: "100%",
    },
    ".cm-content": {
      fontFamily: "var(--font-mono)",
      caretColor: cv("foreground"),
      padding: "0.75rem 0",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: cv("foreground") },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: cv("border") },
    ".cm-panels": {
      backgroundColor: cv("card"),
      color: cv("foreground"),
    },
    ".cm-gutters": {
      backgroundColor: cv("background"),
      color: cv("muted-foreground"),
      border: "none",
    },
    ".cm-activeLineGutter, .cm-activeLine": {
      backgroundColor: cv("muted"),
    },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.75rem 0 0.5rem" },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: cv("muted"),
      outline: `1px solid ${cv("border")}`,
    },
    ".cm-searchMatch": {
      backgroundColor: cv("warning"),
      opacity: 0.35,
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: cv("warning"),
      opacity: 0.6,
    },
    ".cm-tooltip": {
      backgroundColor: cv("card"),
      border: `1px solid ${cv("border")}`,
      color: cv("foreground"),
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: cv("muted"),
      color: cv("foreground"),
    },
  },
  { dark: false },
);

// Muted-foreground for structural syntax, foreground for identifiers,
// info/success/warning/destructive for the four semantic categories that
// actually help scanning generated web-app source (strings, numbers/
// literals, keywords, and errors/invalid syntax) — reusing the console's
// existing status-color vocabulary rather than inventing a fifth palette
// just for the editor.
const highlightStyle = HighlightStyle.define([
  { tag: t.comment, color: cv("muted-foreground"), fontStyle: "italic" },
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: cv("info") },
  { tag: [t.string, t.special(t.string)], color: cv("success") },
  { tag: [t.number, t.bool, t.null, t.atom], color: cv("warning") },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: cv("foreground"), fontWeight: "600" },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: cv("foreground") },
  { tag: [t.propertyName, t.attributeName], color: cv("foreground") },
  { tag: [t.typeName, t.className, t.tagName], color: cv("info") },
  { tag: t.operator, color: cv("muted-foreground") },
  { tag: t.punctuation, color: cv("muted-foreground") },
  { tag: t.bracket, color: cv("muted-foreground") },
  { tag: t.invalid, color: cv("destructive") },
  { tag: t.link, color: cv("info"), textDecoration: "underline" },
  { tag: t.heading, color: cv("foreground"), fontWeight: "700" },
  { tag: t.meta, color: cv("muted-foreground") },
]);

/** The complete theme, as CodeMirror extensions — spread into a
 *  ReactCodeMirror's `extensions` array (its own `theme` prop is left at
 *  the default, since this already sets colors directly rather than
 *  toggling CodeMirror's built-in light/dark palettes). */
export const consoleCodeMirrorTheme = [theme, syntaxHighlighting(highlightStyle)];
