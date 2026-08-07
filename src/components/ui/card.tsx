import { cn } from "@/lib/utils";

/**
 * Card.
 *
 * Hairline border, no shadow. Shadows imply elevation, and in a dense
 * data console nothing is floating — the border is enough to group
 * content, and it stays crisp in both themes where a shadow does not.
 */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "hairline rounded-lg border-border bg-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("hairline-b border-border px-4 py-3", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-foreground text-sm font-medium", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-3", className)} {...props} />;
}

/**
 * A single headline figure — month-to-date spend, running instances.
 *
 * Numbers use tabular figures so a row of stats stays in vertical
 * register as values change, rather than shifting on every poll.
 */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="tabular text-foreground text-xl font-medium">
        {value}
      </span>
      {hint && (
        <span className="text-muted-foreground text-xs">{hint}</span>
      )}
    </div>
  );
}
