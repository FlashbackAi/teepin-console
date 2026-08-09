"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
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
import { formatAccountNumber, timeAgo } from "@/lib/utils";

export default function ControlCenterAccountsPage() {
  const accounts = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: admin.listAccounts,
  });

  const rows = accounts.data?.accounts ?? [];

  return (
    <>
      <PageHeader breadcrumb={["Control centre", "Accounts"]} />

      <div className="p-6">
        <Card>
          {accounts.isLoading ? (
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              Loading…
            </div>
          ) : accounts.isError ? (
            <EmptyState
              title="Could not load accounts"
              description={errorMessage(accounts.error)}
            />
          ) : rows.length === 0 ? (
            <EmptyState title="No accounts" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Account</TH>
                  <TH>Number</TH>
                  <TH>Alias</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((account) => (
                  <TR key={account.id}>
                    <TD>
                      <Link
                        href={`/controlcenter/accounts/${account.id}`}
                        className="text-foreground font-medium hover:underline"
                      >
                        {account.display_name}
                      </Link>
                    </TD>
                    <TD>
                      <span className="identifier text-muted-foreground">
                        {formatAccountNumber(account.account_number)}
                      </span>
                    </TD>
                    <TD>
                      <span className="identifier text-muted-foreground">
                        {account.alias}
                      </span>
                    </TD>
                    <TD className="text-muted-foreground">
                      {account.type === "organization"
                        ? "Organization"
                        : "Personal"}
                    </TD>
                    <TD className="text-muted-foreground">{account.status}</TD>
                    <TD className="text-muted-foreground">
                      {timeAgo(account.created_at)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
