"use client";

import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreditBalance } from "@/lib/api/hooks";
import { formatCost } from "@/lib/utils";

/**
 * Credits.
 *
 * Credits are a prepaid balance spent before the card is ever charged —
 * they do NOT remove the need for a card on file. This screen shows what
 * the account has left; grants are operator-issued (the customer cannot
 * grant themselves credit), so there is no action here, only visibility.
 */
export default function CreditsPage() {
  const credit = useCreditBalance();
  const balance = credit.data?.balance ?? 0;

  return (
    <>
      <PageHeader breadcrumb={["Billing & Cost Management", "Credits"]} />

      <div className="flex max-w-2xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Credit balance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <span className="tabular text-foreground text-3xl font-medium">
              {credit.isLoading ? "—" : formatCost(balance)}
            </span>
            <p className="text-muted-foreground text-sm">
              {balance > 0
                ? "Applied automatically as you use the platform, before your card is charged."
                : "You have no credit. Usage is billed to your payment method."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="text-muted-foreground py-4 text-sm">
            Credits are issued by TEEPIN — for example, during a pilot or as
            a service credit. They are spent before any charge is made to
            your card, and a valid payment method is still required to run
            resources.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
