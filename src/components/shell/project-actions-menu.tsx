"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, MoreHorizontal, Settings } from "lucide-react";

/**
 * Per-project row actions — shared by the Home projects preview and the
 * /projects list, so both offer exactly the same two things: switch to
 * this project, or go manage its settings. A dedicated "Switch to" button
 * plus a settings icon link (the two previous, separate treatments) took
 * more row width than a single menu and didn't scale visually once Home
 * needed the same actions in a narrower column.
 */
export function ProjectActionsMenu({
  projectId,
  isActive,
  onSwitch,
}: {
  projectId: string;
  isActive: boolean;
  onSwitch: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Same close-on-outside-click/Escape behaviour as ProjectSwitcher's own
  // dropdown — see that component's doc comment on why `click` and not
  // `mousedown`.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("click", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Project actions"
        className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-7 w-7 items-center justify-center rounded"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="hairline absolute top-full right-0 z-50 mt-1 w-40 overflow-hidden rounded-md border-border bg-card p-1 shadow-lg"
        >
          {!isActive && (
            <button
              role="menuitem"
              onClick={() => {
                onSwitch(projectId);
                setOpen(false);
              }}
              className="text-foreground hover:bg-muted flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Switch to
            </button>
          )}
          <Link
            href={`/projects/${projectId}/settings`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="text-foreground hover:bg-muted flex h-8 w-full items-center gap-2 rounded px-2 text-xs"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </Link>
        </div>
      )}
    </div>
  );
}
