"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, MoreVertical, Settings } from "lucide-react";

// Matches the menu's own w-40.
const MENU_WIDTH = 160;

/**
 * Per-project row actions — shared by the Home projects preview and the
 * /projects list, so both offer exactly the same two things: switch to
 * this project, or go manage its settings. A dedicated "Switch to" button
 * plus a settings icon link (the two previous, separate treatments) took
 * more row width than a single menu and didn't scale visually once Home
 * needed the same actions in a narrower column.
 *
 * The menu itself renders through a portal into document.body, positioned
 * by the trigger button's own viewport rect, rather than as a normal
 * absolutely-positioned child. Both call sites live inside a Table, whose
 * wrapper sets overflow-x-auto — and per the CSS overflow spec, setting
 * only one axis to something other than visible forces the other axis to
 * compute as auto too. That silently made the table scrollable and
 * clipped the menu against its own row instead of letting it float over
 * the rest of the card, which is what a portal avoids entirely.
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Right-align the menu under the button, same as the old absolute
      // "top-full right-0" positioning did relative to its own wrapper.
      setPos({ top: rect.bottom + 4, left: rect.right - MENU_WIDTH });
    }
    setOpen((value) => !value);
  };

  // Same close-on-outside-click/Escape behaviour as ProjectSwitcher's own
  // dropdown — see that component's doc comment on why `click` and not
  // `mousedown`. Also closes on scroll/resize: the menu's position is
  // computed once, at open time, so it would otherwise drift away from
  // its trigger as the table or page scrolls underneath it.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);

    document.addEventListener("click", onPointerDown);
    document.addEventListener("keydown", onKey);
    // Capture phase: the table's own scroll container doesn't bubble a
    // "scroll" event to window otherwise.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("click", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Project actions"
        className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-7 w-7 items-center justify-center rounded"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="hairline fixed z-50 overflow-hidden rounded-md border-border bg-card p-1 shadow-lg"
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
          </div>,
          document.body,
        )}
    </>
  );
}
