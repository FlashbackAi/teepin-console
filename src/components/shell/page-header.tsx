import { cn } from "@/lib/utils";

/**
 * Page header: breadcrumb on the left, the one primary action on the
 * right.
 *
 * The breadcrumb repeats what the sidebar shows, deliberately — the
 * sidebar answers "where can I go", the breadcrumb answers "where am I",
 * and during an incident the second question is asked far more often.
 */
export function PageHeader({
  breadcrumb,
  action,
  className,
}: {
  breadcrumb: string[];
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
        {breadcrumb.map((crumb, index) => (
          <span key={index}>
            {index > 0 && (
              <span className="text-muted-foreground/50 mx-1.5">/</span>
            )}
            <span
              className={
                index === breadcrumb.length - 1 ? "text-foreground" : undefined
              }
            >
              {crumb}
            </span>
          </span>
        ))}
      </nav>
      {action}
    </header>
  );
}
