import { cn } from "@/lib/utils";

/**
 * Data table.
 *
 * 32px rows with hairline separators: dense enough to scan 40 instances
 * without scrolling, which is the actual job. Comfortable 48px rows look
 * better in a screenshot and worse in use.
 *
 * Wrapped in an overflow container so a wide table scrolls itself rather
 * than pushing the page sideways — horizontal page scroll in an admin
 * tool is always a bug.
 */

export function Table({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function THead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("hairline-b border-border", className)}
      {...props}
    />
  );
}

export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "hairline-b border-border last:border-0",
        // Hover is a background shift only — no border colour change,
        // which would make the row appear to move.
        "hover:bg-muted/50",
        className,
      )}
      {...props}
    />
  );
}

export function TH({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-8 px-3 text-left align-middle",
        // Headers are quieter than the data they label: the data is what
        // the customer came for.
        "text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("h-8 px-3 align-middle", className)} {...props} />
  );
}

/**
 * Empty state.
 *
 * Every table needs one. "No instances" with a way to create the first
 * is the difference between a new customer acting and a new customer
 * assuming the page is broken.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-foreground font-medium">{title}</p>
      {description && (
        <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
