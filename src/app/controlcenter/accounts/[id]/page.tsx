"use client";

import { use, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
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
import { InvoiceStatusPill } from "./invoice-status";
import type { Project } from "@/lib/api/types";

export default function ControlCenterAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [invoicing, setInvoicing] = useState<Project | null>(null);

  const accounts = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: admin.listAccounts,
  });

  const projects = useQuery({
    queryKey: ["admin", "projects", id],
    queryFn: () => admin.listAccountProjects(id),
  });

  const account = accounts.data?.accounts.find((a) => a.id === id);
  const projectList = projects.data?.projects ?? [];

  // One invoice query per project. Fine at this scale — an operator is
  // looking at a handful of projects, not paginating thousands.
  const invoiceQueries = useQueries({
    queries: projectList.map((project) => ({
      queryKey: ["admin", "invoices", project.id],
      queryFn: () => admin.listProjectInvoices(project.id),
    })),
  });

  return (
    <>
      <PageHeader
        breadcrumb={[
          "Control centre",
          "Accounts",
          account?.display_name ?? "…",
        ]}
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
            </div>
          </Card>
        )}

        {projects.isLoading ? (
          <Card>
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              Loading projects…
            </div>
          </Card>
        ) : projectList.length === 0 ? (
          <Card>
            <EmptyState
              title="No projects"
              description="This account has no projects to invoice against."
            />
          </Card>
        ) : (
          projectList.map((project, index) => {
            const invoices = invoiceQueries[index];
            const rows = invoices?.data?.invoices ?? [];

            return (
              <Card key={project.id}>
                <CardHeader className="flex items-center justify-between">
                  <CardTitle>{project.name}</CardTitle>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setInvoicing(project)}
                  >
                    Issue invoice
                  </Button>
                </CardHeader>

                {invoices?.isLoading ? (
                  <div className="text-muted-foreground px-4 py-6 text-center text-sm">
                    Loading invoices…
                  </div>
                ) : rows.length === 0 ? (
                  <div className="text-muted-foreground px-4 py-6 text-sm">
                    No invoices for this project yet.
                  </div>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Invoice</TH>
                        <TH>Period</TH>
                        <TH>Source</TH>
                        <TH>Status</TH>
                        <TH className="text-right">Total</TH>
                        <TH className="text-right">Actions</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rows.map((invoice) => (
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
                              projectId={project.id}
                            />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
            );
          })
        )}
      </div>

      {invoicing && (
        <ManualInvoiceDialog
          project={invoicing}
          onClose={() => setInvoicing(null)}
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
  projectId,
}: {
  invoiceId: string;
  status: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["admin", "invoices", projectId],
    });

  const issue = useMutation({
    mutationFn: () => admin.issueInvoice(invoiceId),
    onSuccess: refresh,
  });

  const voidInvoice = useMutation({
    mutationFn: () => admin.voidInvoice(invoiceId),
    onSuccess: refresh,
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

  if (status === "open") {
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
