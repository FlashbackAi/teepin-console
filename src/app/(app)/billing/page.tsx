"use client";

import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, Stat } from "@/components/ui/card";
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
import {
  errorMessage,
  useBillingSummary,
  useCreditBalance,
  useInvoices,
} from "@/lib/api/hooks";
import { formatCost, fullTime, triggerDownload } from "@/lib/utils";

/**
 * Billing.
 *
 * Three tabs, not the five AWS's own Bills page has (Charges by
 * service / by account / Invoices / Savings / Taxes) — Savings and Taxes
 * have no data behind them on this platform yet (no savings plans, no
 * tax engine — ROADMAP B6), and a tab that goes nowhere is worse than no
 * tab. Add them when there is something real to show, not before.
 *
 * Overview and Usage stay client-side tabs under one URL (matching AWS's
 * own pattern here) because a customer switching between "what am I
 * being charged" and "what have I been sent" is browsing one page's
 * facets. Invoice DETAIL breaks that rule deliberately — see
 * /billing/invoices/[id] — because a specific invoice is a document
 * referenced later, in a support ticket or the customer's own
 * accounting, and deserves a real bookmarkable URL.
 */
export default function BillingPage() {
  const [tab, setTab] = useState("overview");

  const billing = useBillingSummary();
  const invoices = useInvoices();

  const period = billing.data
    ? new Date(billing.data.period_start).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : "";

  const openInvoiceCount = invoices.data?.invoices.filter(
    (inv) => inv.status === "open",
  ).length;

  return (
    <>
      <PageHeader breadcrumb={["Billing"]} />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "usage", label: "Usage" },
          {
            id: "invoices",
            label: "Invoices",
            badge: invoices.data ? String(invoices.data.count) : undefined,
          },
        ]}
      />

      <div className="flex flex-col gap-6 p-6">
        {billing.isError && (
          <Card className="px-4 py-3">
            <p className="text-muted-foreground text-sm">
              {errorMessage(billing.error)}
            </p>
          </Card>
        )}

        {tab === "overview" && (
          <OverviewTab
            billing={billing.data}
            period={period}
            openInvoiceCount={openInvoiceCount}
            onViewInvoices={() => setTab("invoices")}
          />
        )}

        {tab === "usage" && <UsageTab billing={billing} />}

        {tab === "invoices" && <InvoicesTab invoices={invoices} />}
      </div>
    </>
  );
}

function OverviewTab({
  billing,
  period,
  openInvoiceCount,
  onViewInvoices,
}: {
  billing: ReturnType<typeof useBillingSummary>["data"];
  period: string;
  openInvoiceCount: number | undefined;
  onViewInvoices: () => void;
}) {
  // Credits are spent before the card is charged, so a customer wants to
  // see what they have left. Shown only when there is a balance — an
  // account with no credits does not need a "$0.00 credit" stat.
  const credit = useCreditBalance();
  const hasCredit = (credit.data?.balance ?? 0) > 0;

  return (
    <>
      <section className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat
          label="Month to date"
          value={billing ? formatCost(billing.total_cost) : "—"}
          hint={period}
        />
        {hasCredit && (
          <Stat
            label="Credit remaining"
            value={formatCost(credit.data!.balance)}
            hint="Applied before your card is charged"
          />
        )}
        <Stat
          label="Projects billed"
          value={billing ? String(billing.projects.length) : "—"}
        />
        <button
          onClick={onViewInvoices}
          disabled={!openInvoiceCount}
          className="flex flex-col gap-0.5 text-left disabled:cursor-default"
        >
          <span className="text-muted-foreground text-xs">Invoices due</span>
          <span className="tabular text-foreground text-xl font-medium">
            {openInvoiceCount !== undefined ? String(openInvoiceCount) : "—"}
          </span>
          {Boolean(openInvoiceCount) && (
            <span className="text-foreground text-xs hover:underline">
              View
            </span>
          )}
        </button>
      </section>

      {!billing?.projects.length ? null : (
        <Card>
          <CardHeader>
            <CardTitle>By project this period</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Project</TH>
                <TH className="text-right">Cost</TH>
              </TR>
            </THead>
            <TBody>
              {billing.projects.map((project) => (
                <TR key={project.project_id}>
                  <TD className="font-medium">{project.project_name}</TD>
                  <TD className="tabular text-right">
                    {formatCost(project.cost)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}

function UsageTab({
  billing,
}: {
  billing: ReturnType<typeof useBillingSummary>;
}) {
  const data = billing.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage by project</CardTitle>
      </CardHeader>

      {billing.isLoading ? (
        <Loading className="px-4 py-16" />
      ) : !data?.projects.length ? (
        <EmptyState
          title="No usage yet"
          description="GPU time is metered hourly. Costs appear here within an hour of an instance running."
        />
      ) : (
        <CardContent className="flex flex-col gap-6">
          {data.projects.map((project) => (
            <div key={project.project_id}>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-foreground text-sm font-medium">
                  {project.project_name}
                </span>
                <span className="tabular text-foreground text-sm">
                  {formatCost(project.cost)}
                </span>
              </div>
              <Table>
                <THead>
                  <TR>
                    <TH>Service</TH>
                    <TH className="text-right">Quantity</TH>
                    <TH className="text-right">Instances</TH>
                    <TH className="text-right">Cost</TH>
                  </TR>
                </THead>
                <TBody>
                  {project.services.map((service) => (
                    <TR key={service.service}>
                      <TD>{service.service}</TD>
                      <TD className="tabular text-muted-foreground text-right">
                        {service.quantity.toFixed(4)} {service.unit}
                      </TD>
                      <TD className="tabular text-muted-foreground text-right">
                        {service.instances}
                      </TD>
                      <TD className="tabular text-right">
                        {formatCost(service.cost)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function InvoicesTab({
  invoices,
}: {
  invoices: ReturnType<typeof useInvoices>;
}) {
  const rows = invoices.data?.invoices ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
      </CardHeader>

      {invoices.isLoading ? (
        <Loading className="px-4 py-16" />
      ) : invoices.isError ? (
        <EmptyState
          title="Could not load invoices"
          description={errorMessage(invoices.error)}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Usage invoices appear here once generated. Draft invoices are not shown until issued."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Invoice</TH>
              <TH>Period</TH>
              <TH>Issued</TH>
              <TH>Status</TH>
              <TH className="text-right">Total</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((invoice) => (
              <TR key={invoice.id}>
                <TD>
                  <InvoiceNumberCell invoice={invoice} />
                </TD>
                <TD className="text-muted-foreground">
                  {invoice.period_start.slice(0, 10)} →{" "}
                  {invoice.period_end.slice(0, 10)}
                </TD>
                <TD
                  className="text-muted-foreground"
                  title={fullTime(invoice.created_at)}
                >
                  {invoice.created_at.slice(0, 10)}
                </TD>
                <TD>
                  <InvoiceStatusPill status={invoice.status} />
                </TD>
                <TD className="tabular text-right">
                  {formatCost(invoice.total)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

/**
 * The invoice number in the Invoices table.
 *
 * When a stored PDF exists, clicking downloads it directly — the primary
 * action a customer wants from an invoice is a copy for their records, so
 * the number IS the download control rather than a step toward one.
 *
 * When no document exists yet (an invoice issued before PDF storage, or
 * one whose generation has not been backfilled), it falls back to a link
 * to the on-screen detail page — the invoice must still be reachable.
 */
function InvoiceNumberCell({ invoice }: { invoice: Invoice }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!invoice.pdf_available) {
    return (
      <Link
        href={`/billing/invoices/${invoice.id}`}
        className="identifier text-foreground hover:underline"
      >
        {invoice.invoice_number}
      </Link>
    );
  }

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
    <button
      type="button"
      onClick={download}
      disabled={downloading}
      title={error ?? "Download PDF"}
      className="identifier text-foreground hover:underline disabled:opacity-60"
    >
      {invoice.invoice_number}
      {downloading && (
        <span className="text-muted-foreground ml-1.5 text-xs">↓</span>
      )}
    </button>
  );
}
