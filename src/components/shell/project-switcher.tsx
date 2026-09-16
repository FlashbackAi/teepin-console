"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Project } from "@/lib/api/types";
import { CreateProjectDialog } from "@/components/shell/create-project-dialog";
import { EnvironmentBadge } from "@/components/ui/environment-badge";

// Past this many, the dropdown stops trying to list every project — it
// switches to a fixed preview plus a link to the full /projects page
// instead of scrolling indefinitely inside a small popover.
const PREVIEW_COUNT = 6;

/**
 * Project switcher.
 *
 * Everything below it in the sidebar is project-scoped and billed to
 * that project, so switching has to be one click from anywhere — not a
 * trip to a table. The current project is always visible for the same
 * reason: a customer must never be unsure which project they are about
 * to spend money in.
 */
export function ProjectSwitcher({
  projects,
  active,
  onSelect,
}: {
  projects: Project[];
  active?: Project;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The active project always leads — it's what the customer is already
  // looking at — then the rest newest-first, since a project just created
  // is the one most likely being switched to next.
  const ordered = [...projects].sort((a, b) => {
    if (a.id === active?.id) return -1;
    if (b.id === active?.id) return 1;
    return (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });

  // Close on outside click and on Escape — a dropdown that traps the
  // customer is worse than one that closes too eagerly.
  //
  // Registered on `click`, not `mousedown`. With mousedown the very
  // press that opens the menu is still propagating when this listener is
  // attached, so it fires immediately and the menu closes before it can
  // render — it simply never appears.
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
    <div ref={ref} className="relative">
      <button
        onClick={(event) => {
          // Keeps this click from reaching the document listener that
          // closes the menu, which would otherwise cancel the open on
          // the same event.
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "hairline flex h-8 w-full items-center gap-2 rounded-md border-border px-2",
          "text-left text-sm",
          open ? "bg-muted" : "hover:bg-muted/60",
        )}
      >
        <span className="text-foreground min-w-0 flex-1 truncate text-xs font-medium tracking-wide uppercase">
          {active?.name ?? "No project"}
        </span>
        <ChevronsUpDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      </button>

      {open && (
        <div
          role="listbox"
          className="hairline absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-md border-border bg-card shadow-lg"
        >
          <div className="max-h-64 overflow-y-auto p-1">
            {ordered.slice(0, PREVIEW_COUNT).map((project) => (
              <button
                key={project.id}
                role="option"
                aria-selected={project.id === active?.id}
                onClick={() => {
                  onSelect(project.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded px-2 text-left",
                  "hover:bg-muted",
                )}
              >
                <span className="text-foreground min-w-0 flex-1 truncate text-xs font-medium tracking-wide uppercase">
                  {project.name}
                </span>
                <EnvironmentBadge project={project} />
                {project.id === active?.id && (
                  <Check className="text-foreground h-3.5 w-3.5 shrink-0" />
                )}
              </button>
            ))}
          </div>

          {projects.length > PREVIEW_COUNT && (
            <div className="hairline-t border-border p-1">
              <Link
                href="/projects"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-7 items-center gap-2 rounded px-2 text-xs"
              >
                View all {projects.length} projects →
              </Link>
            </div>
          )}

          <div className="hairline-t border-border p-1">
            <button
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              New project
            </button>
          </div>
        </div>
      )}

      {creating && (
        <CreateProjectDialog onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
