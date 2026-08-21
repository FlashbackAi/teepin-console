"use client";

import { use, useState } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceStatusPill } from "@/components/ui/invoice-status";
import { Loading } from "@/components/ui/loading";
import {
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { Invoice } from "@/lib/api/types";
import { errorMessage, useInvoice } from "@/lib/api/hooks";
import { formatCost, fullTime, triggerDownload } from "@/lib/utils";

/**
 * Invoice detail.
 *
 * Its own page, not a dialog: a customer references one specific
 * invoice later — a support ticket, their own accounting — and that
 * deserves a real, bookmarkable URL, the same reasoning already applied
 * to /compute/[id] and /projects/[id] elsewhere in this console.
 *
 * The primary click target for an invoice is now a DIRECT download from
 * the Invoices table; this page remains for direct links/bookmarks and
 * for reading the invoice on screen, and carries its own "Download PDF"
 * action (header) when a stored document exists.
 */
export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const invoice = useInvoice(id);

  if (invoice.isLoading) {
    return (
      <>
        <PageHeader breadcrumb={["Billing", "Invoices", "…"]} />
        <Loading className="py-16" />
      </>
    );
  }

  if (invoice.isError || !invoice.data) {
    return (
      <>
        <PageHeader breadcrumb={["Billing", "Invoices", "Not found"]} />
        <div className="p-6">
          <Card>
            <EmptyState
              title="Invoice not found"
              description={errorMessage(invoice.error)}
            />
          </Card>
        </div>
      </>
    );
  }

  const inv = invoice.data;

  // Distinct projects across the line items, for the "billed for" line —
  // an invoice with charges from three projects should say so plainly,
  // not make the customer count rows.
  const projectNames = Array.from(
    new Set(
      (inv.line_items ?? [])
        .map((item) => item.project_name)
        .filter((name): name is string => Boolean(name)),
    ),
  );

  return (
    <>
      <PageHeader
        breadcrumb={["Billing", "Invoices", inv.invoice_number]}
        action={inv.pdf_available ? <DownloadPdfButton invoice={inv} /> : null}
      />

      <div className="flex max-w-3xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-3">
                <span className="identifier">{inv.invoice_number}</span>
                <InvoiceStatusPill status={inv.status} />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            <Detail label="Period">
              {inv.period_start.slice(0, 10)} → {inv.period_end.slice(0, 10)}
            </Detail>
            <Detail label="Issued">{fullTime(inv.created_at)}</Detail>
            {inv.due_date && (
              <Detail label="Due">{inv.due_date.slice(0, 10)}</Detail>
            )}
            <Detail label="Billed for">
              {projectNames.length === 0
                ? "Account-wide"
                : projectNames.join(", ")}
            </Detail>
            <Detail label="Currency">{inv.currency}</Detail>
            {inv.paid_at && (
              <Detail label="Paid">{fullTime(inv.paid_at)}</Detail>
            )}
          </CardContent>
        </Card>

        {(inv.bill_to_name || inv.bill_to_email || inv.bill_to_address) && (
          <Card>
            <CardHeader>
              <CardTitle>Bill to</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {/* Snapshotted at issue time — see INVOICE-DESIGN.md "The
                  snapshot rule". Deliberately not the account's CURRENT
                  details: this is what was true when the invoice was
                  sent. */}
              {inv.bill_to_name && (
                <span className="text-foreground font-medium">
                  {inv.bill_to_name}
                </span>
              )}
              {inv.bill_to_address && (
                <span className="text-muted-foreground">
                  {inv.bill_to_address}
                </span>
              )}
              {inv.bill_to_email && (
                <span className="text-muted-foreground">
                  {inv.bill_to_email}
                </span>
              )}
              {inv.bill_to_tax_id && (
                <span className="text-muted-foreground">
                  Tax ID: {inv.bill_to_tax_id}
                </span>
              )}
              {inv.bill_to_account_number && (
                <span className="identifier text-muted-foreground">
                  Account {inv.bill_to_account_number}
                </span>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          {!inv.line_items?.length ? (
            <div className="text-muted-foreground px-4 py-6 text-sm">
              No line items recorded.
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Description</TH>
                  <TH>Project</TH>
                  <TH className="text-right">Quantity</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {inv.line_items.map((item, i) => (
                  <TR key={item.id ?? i}>
                    <TD>{item.description}</TD>
                    <TD className="text-muted-foreground">
                      {item.project_name ?? "—"}
                    </TD>
                    <TD className="tabular text-muted-foreground text-right">
                      {item.quantity
                        ? `${item.quantity} ${item.unit ?? ""}`.trim()
                        : "—"}
                    </TD>
                    <TD className="tabular text-right">
                      {formatCost(item.amount)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}

          <div className="hairline-t flex flex-col gap-1 border-border px-4 py-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular text-foreground">
                {formatCost(inv.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular text-foreground">
                {formatCost(inv.tax)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-medium">
              <span className="text-foreground">Total</span>
              <span className="tabular text-foreground">
                {formatCost(inv.total)}
              </span>
            </div>
          </div>
        </Card>

        {inv.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">{inv.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-foreground text-sm">{children}</span>
    </div>
  );
}

/** Header action: fetches the stored PDF (authed) and saves it. */
function DownloadPdfButton({ invoice }: { invoice: Invoice }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setError(null);
    setDownloading(true);
    try {
      const { url } = await api.invoicePdfUrl(invoice.id);
      triggerDownload(url);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      onClick={download}
      disabled={downloading}
      title={error ?? undefined}
    >
      {downloading ? "Downloading…" : "Download PDF"}
    </Button>
  );
}
