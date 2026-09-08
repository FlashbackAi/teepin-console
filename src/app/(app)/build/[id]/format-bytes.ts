/** Human-readable byte size for the IDE's version history and status bar —
 *  no existing formatter in lib/utils.ts covers this (formatCost/
 *  formatRate are dollar amounts), so it's local to the IDE rather than
 *  growing the shared util for one caller. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
