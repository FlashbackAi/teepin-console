import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/api/types";

/**
 * Invoice status.
 *
 * Colour is used sparingly and only where it carries meaning: `open`
 * means money is owed — the one both a customer and an operator scan
 * for. `draft` is neutral because it is not yet a financial fact (a
 * customer never sees a draft at all — see the tenancy note on
 * BillingHandler.ListInvoices), and `void` is muted because it is a
 * record that no longer applies.
 *
 * Shared between the customer console (/billing) and the control centre
 * (/controlcenter) rather than duplicated: the same document has the
 * same status regardless of who is looking at it.
 */
const STYLES: Record<InvoiceStatus, { dot: string; label: string }> = {
  draft: { dot: "bg-muted-foreground", label: "Draft" },
  open: { dot: "bg-warning", label: "Open" },
  paid: { dot: "bg-success", label: "Paid" },
  void: { dot: "bg-muted-foreground/50", label: "Void" },
  uncollectible: { dot: "bg-destructive", label: "Uncollectible" },
};

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  const style = STYLES[status] ?? STYLES.draft;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", style.dot)}
        aria-hidden
      />
      <span className="text-foreground">{style.label}</span>
    </span>
  );
}
