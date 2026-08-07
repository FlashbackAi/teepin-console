"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Modal dialog.
 *
 * Escape closes, the backdrop closes, and focus is trapped to the
 * dialog. Body scroll is locked while open — a modal over a page that
 * scrolls behind it is disorienting.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[10vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "hairline w-full max-w-lg rounded-lg border-border bg-card shadow-lg",
          className,
        )}
      >
        <div className="hairline-b flex items-start justify-between border-border px-4 py-3">
          <div>
            <h2 className="text-foreground text-sm font-medium">{title}</h2>
            {description && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 rounded p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4">{children}</div>

        {footer && (
          <div className="hairline-t flex items-center justify-end gap-2 border-border px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
