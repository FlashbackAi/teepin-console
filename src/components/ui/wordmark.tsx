import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * TEEPIN wordmark.
 *
 * Two assets rather than one, because the mark is not a single-colour
 * shape: the cyan square in the P is part of the logo and must survive
 * in both themes. A `currentColor` SVG would flatten it to the text
 * colour, and a CSS filter would shift the cyan along with the letters.
 *
 * Both are rendered and one is hidden by theme, rather than swapping
 * `src` from React state. Swapping in JS means the wrong logo paints on
 * first load and corrects a frame later — the same flash the theme
 * script exists to prevent, reintroduced by the logo.
 *
 * The supplied .svg files are NOT vectors: each is a base64 PNG inside
 * an SVG wrapper, 166KB against the PNG's 29KB. The PNGs are used
 * directly, and next/image serves correctly-sized WebP from them.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    // aspect-[2218/709] rather than a hardcoded width: the box follows
    // whatever height the caller sets and the mark never stretches.
    // Callers set height only.
    //
    // h-8 (32px) as the default. The letterforms are thin horizontal
    // bars with wide gaps, so the mark needs noticeably more height than
    // a text logo of the same visual weight — below ~24px the T and E
    // strokes land on sub-pixel boundaries and it reads as grey mush.
    <span
      className={cn("relative inline-block h-8 aspect-[2218/709]", className)}
    >
      {/* Dark letterforms for light theme. */}
      <Image
        src="/logo-black.png"
        alt="TEEPIN"
        fill
        sizes="200px"
        priority
        className="object-contain object-left dark:hidden"
      />
      {/* Light letterforms for dark theme. Decorative: the alt text
          above already names the mark, so a second one would make a
          screen reader announce "TEEPIN" twice. */}
      <Image
        src="/logo-white.png"
        alt=""
        aria-hidden
        fill
        sizes="200px"
        priority
        className="hidden object-contain object-left dark:block"
      />
    </span>
  );
}
