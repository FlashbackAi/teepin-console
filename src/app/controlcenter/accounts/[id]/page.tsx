"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
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
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import { formatAccountNumber, formatCost, timeAgo } from "@/lib/utils";
import { ManualInvoiceDialog } from "./manual-invoice-dialog";
import { UsageInvoiceDialog } from "./usage-invoice-dialog";
import { GrantCreditDialog } from "./grant-credit-dialog";
import { InvoiceStatusPill } from "@/components/ui/invoice-status";

/**
 * An invoice belongs to the ACCOUNT, the same way one AWS bill covers
 * every service under an account rather than one bill per service. This
 * page therefore has ONE invoice list and one "Issue invoice" action —
 * not one per project. The per-project breakdown a customer still needs
 * (which project incurred what) lives on individual line items instead;
 * see the project column in the invoice table below.
 */
export default function ControlCenterAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [invoicing, setInvoicing] = useState(false);
  const [usageInvoicing, setUsageInvoicing] = useState(false);
  const [granting, setGranting] = useState(false);

  const credits = useQuery({
    queryKey: ["admin", "credits", id],
    queryFn: () => admin.getAccountCredits(id),
  });

  const accounts = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: admin.listAccounts,
  });

  const projects = useQuery({
    queryKey: ["admin", "projects", id],
    queryFn: () => admin.listAccountProjects(id),
  });

  const invoices = useQuery({
    queryKey: ["admin", "invoices", id],
    queryFn: () => admin.listAccountInvoices(id),
  });

  const account = accounts.data?.accounts.find((a) => a.id === id);
  const rows = invoices.data?.invoices ?? [];

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Control centre", href: "/controlcenter" },
          { label: "Accounts", href: "/controlcenter" },
          account?.display_name ?? "…",
        ]}
        action={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGranting(true)}
              disabled={!account}
            >
              Grant credit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUsageInvoicing(true)}
              disabled={!account}
            >
              Generate usage invoice
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setInvoicing(true)}
              disabled={!account}
            >
              Issue invoice
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        {account && (
          <Card>
            <CardHeader>
              <CardTitle>{account.display_name}</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 px-4 py-3 lg:grid-cols-4">
              <Detail label="Account number">
                <span className="identifier">
                  {formatAccountNumber(account.account_number)}
                </span>
              </Detail>
              <Detail label="Alias">
                <span className="identifier">{account.alias}</span>
              </Detail>
              <Detail label="Type">
                {account.type === "organization" ? "Organization" : "Personal"}
              </Detail>
              <Detail label="Billing email">
                {account.billing_email ?? "—"}
              </Detail>
              <Detail label="Credit balance">
                <span className="tabular">
                  {credits.data ? formatCost(credits.data.balance) : "—"}
                </span>
              </Detail>
            </div>
          </Card>
        )}

        {credits.data && credits.data.transactions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Credit ledger</CardTitle>
            </CardHeader>
            <Table>
              <THead>
                <TR>
                  <TH>Kind</TH>
                  <TH>Reason</TH>
                  <TH>Date</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {credits.data.transactions.map((t) => (
                  <TR key={t.id}>
                    <TD className="capitalize">{t.kind}</TD>
                    <TD className="text-muted-foreground">{t.reason}</TD>
                    <TD className="text-muted-foreground">
                      {t.created_at.slice(0, 10)}
                    </TD>
                    <TD className="tabular text-right">
                      {formatCost(t.amount)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>

          {invoices.isLoading ? (
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              Loading invoices…
            </div>
          ) : invoices.isError ? (
            <EmptyState
              title="Could not load invoices"
              description={errorMessage(invoices.error)}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Issue one to bill this account a negotiated price, independent of metered usage."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setInvoicing(true)}
                >
                  Issue invoice
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Period</TH>
                  <TH>Source</TH>
                  <TH>Projects</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((invoice) => {
                  // Distinct project names across this invoice's line
                  // items — the per-project breakdown, summarised for
                  // the list view. Full detail belongs on an invoice
                  // detail page (not yet built).
                  const projectNames = Array.from(
                    new Set(
                      (invoice.line_items ?? [])
                        .map((item) => item.project_name)
                        .filter((name): name is string => Boolean(name)),
                    ),
                  );

                  return (
                    <TR key={invoice.id}>
                      <TD>
                        <span className="identifier">
                          {invoice.invoice_number}
                        </span>
                      </TD>
                      <TD className="text-muted-foreground">
                        {invoice.period_start?.slice(0, 10)} →{" "}
                        {invoice.period_end?.slice(0, 10)}
                      </TD>
                      <TD className="text-muted-foreground">
                        {invoice.source === "manual" ? "Manual" : "Usage"}
                      </TD>
                      <TD className="text-muted-foreground">
                        {projectNames.length === 0
                          ? "—"
                          : projectNames.length === 1
                            ? projectNames[0]
                            : `${projectNames.length} projects`}
                      </TD>
                      <TD>
                        <InvoiceStatusPill status={invoice.status} />
                      </TD>
                      <TD className="tabular text-right">
                        {formatCost(invoice.total)}
                      </TD>
                      <TD className="text-right">
                        <InvoiceActions
                          invoiceId={invoice.id}
                          status={invoice.status}
                          source={invoice.source}
                          accountId={id}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          {projects.isLoading ? (
            <Loading className="px-4 py-16" />
          ) : !projects.data?.projects.length ? (
            <div className="text-muted-foreground px-4 py-6 text-sm">
              No projects.
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Slug</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {projects.data.projects.map((project) => (
                  <TR key={project.id}>
                    <TD className="font-medium">{project.name}</TD>
                    <TD>
                      <span className="identifier text-muted-foreground">
                        {project.slug}
                      </span>
                    </TD>
                    <TD className="text-muted-foreground">
                      {timeAgo(project.created_at)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {invoicing && account && (
        <ManualInvoiceDialog
          accountId={account.id}
          accountName={account.display_name}
          projects={projects.data?.projects ?? []}
          onClose={() => setInvoicing(false)}
        />
      )}

      {usageInvoicing && account && (
        <UsageInvoiceDialog
          accountId={account.id}
          accountName={account.display_name}
          onClose={() => setUsageInvoicing(false)}
        />
      )}

      {granting && account && (
        <GrantCreditDialog
          accountId={account.id}
          accountName={account.display_name}
          onClose={() => setGranting(false)}
        />
      )}
    </>
  );
}

/**
 * Draft invoices can be issued; issued ones can be voided.
 *
 * There is deliberately no delete: an issued invoice is a financial
 * record, and the correct way to cancel one is to void it so the
 * cancellation is itself recorded.
 */
function InvoiceActions({
  invoiceId,
  status,
  source,
  accountId,
}: {
  invoiceId: string;
  status: string;
  source: string;
  accountId: string;
}) {
  const queryClient = useQueryClient();

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["admin", "invoices", accountId],
    });

  const issue = useMutation({
    mutationFn: () => admin.issueInvoice(invoiceId),
    onSuccess: refresh,
  });

  const voidInvoice = useMutation({
    mutationFn: () => admin.voidInvoice(invoiceId),
    onSuccess: refresh,
  });

  // Charge progress is loaded only for an open USAGE invoice — the only
  // state where a charge is pending — so the list does not fire a query per
  // row for drafts, paid, or manual invoices.
  const chargeable = status === "open" && source === "usage";
  const chargeState = useQuery({
    queryKey: ["admin", "invoice-charge-state", invoiceId],
    queryFn: () => admin.getInvoiceChargeState(invoiceId),
    enabled: chargeable,
  });

  const charge = useMutation({
    mutationFn: () => admin.chargeInvoice(invoiceId),
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({
        queryKey: ["admin", "invoice-charge-state", invoiceId],
      });
    },
  });

  if (status === "draft") {
    return (
      <Button
        variant="secondary"
        size="sm"
        disabled={issue.isPending}
        onClick={() => issue.mutate()}
      >
        {issue.isPending ? "Issuing…" : "Issue"}
      </Button>
    );
  }

  if (chargeable) {
    const attempts = chargeState.data?.charge_attempts ?? 0;
    const lastError = chargeState.data?.last_charge_error;
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={charge.isPending}
            onClick={() => charge.mutate()}
          >
            {charge.isPending ? "Charging…" : "Charge now"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={voidInvoice.isPending}
            onClick={() => voidInvoice.mutate()}
          >
            {voidInvoice.isPending ? "Voiding…" : "Void"}
          </Button>
        </div>
        {/* Surface WHY collection is stuck: attempts made and the last
            decline reason. Only shown once a charge has been attempted. */}
        {attempts > 0 && (
          <span className="text-muted-foreground text-xs">
            {attempts} attempt{attempts === 1 ? "" : "s"}
            {lastError ? ` · ${lastError}` : ""}
          </span>
        )}
      </div>
    );
  }

  if (status === "open") {
    // A manual open invoice: void only, never auto-charge.
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={voidInvoice.isPending}
        onClick={() => voidInvoice.mutate()}
      >
        {voidInvoice.isPending ? "Voiding…" : "Void"}
      </Button>
    );
  }

  return null;
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
