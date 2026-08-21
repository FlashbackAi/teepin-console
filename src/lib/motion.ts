/**
 * SSR-safe check for prefers-reduced-motion. Returns false on the server.
 * Components that animate should call this inside an effect and skip or
 * shorten their timelines if it returns true.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
