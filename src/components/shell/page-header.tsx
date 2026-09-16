import Link from "next/link";

import { cn } from "@/lib/utils";

/** One breadcrumb segment. A bare string renders as plain (non-clickable)
 *  text — the escape hatch for a segment with nowhere sensible to go
 *  (e.g. a still-loading name). Pass an object with `href` for every
 *  segment that has a real page behind it; the LAST segment is always
 *  rendered as plain text regardless of whether it carries an href, since
 *  it names the page already on screen. */
export type Crumb = string | { label: string; href?: string };

function crumbLabel(c: Crumb): string {
  return typeof c === "string" ? c : c.label;
}
function crumbHref(c: Crumb): string | undefined {
  return typeof c === "string" ? undefined : c.href;
}

/**
 * Page header: breadcrumb on the left, the one primary action on the
 * right.
 *
 * The breadcrumb repeats what the sidebar shows, deliberately — the
 * sidebar answers "where can I go", the breadcrumb answers "where am I",
 * and during an incident the second question is asked far more often.
 *
 * Every non-final segment that carries an href is a real link — jumping
 * back up the hierarchy should not require the sidebar at all.
 */
export function PageHeader({
  breadcrumb,
  action,
  className,
}: {
  breadcrumb: Crumb[];
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "hairline-b sticky top-0 z-10 flex h-12 items-center justify-between",
        "border-border bg-background px-6",
        className,
      )}
    >
      <nav className="text-muted-foreground min-w-0 truncate text-sm">
        {breadcrumb.map((crumb, index) => {
          const isLast = index === breadcrumb.length - 1;
          const href = isLast ? undefined : crumbHref(crumb);
          const label = crumbLabel(crumb);
          return (
            <span key={index}>
              {index > 0 && (
                <span className="text-muted-foreground/50 mx-1.5">/</span>
              )}
              {href ? (
                <Link href={href} className="hover:text-foreground hover:underline">
                  {label}
                </Link>
              ) : (
                <span className={isLast ? "text-foreground" : undefined}>
                  {label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      {action}
    </header>
  );
}
