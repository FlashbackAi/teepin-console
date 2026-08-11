"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";

/**
 * Usage-invoice generator.
 *
 * Unlike the manual dialog, an operator does not type line items here —
 * they pick a period and the platform builds the invoice from the meter,
 * one line per (project, resource). It is created as a DRAFT so the
 * numbers can be reviewed before issuing, exactly like a manual invoice.
 *
 * The period cannot extend past today: an invoice bills for usage that
 * has already been recorded, and a period ending in the future would
 * bill for activity that has not happened. The backend enforces the same
 * rule.
 */
export function UsageInvoiceDialog({
  accountId,
  accountName,
  onClose,
}: {
  accountId: string;
  accountName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const today = new Date();
  const todayIso = iso(today);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [periodStart, setPeriodStart] = useState(iso(firstOfMonth));
  const [periodEnd, setPeriodEnd] = useState(todayIso);

  const generate = useMutation({
    mutationFn: () =>
      admin.generateUsageInvoice(accountId, {
        period_start: periodStart,
        period_end: periodEnd,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "invoices", accountId],
      });
      onClose();
    },
  });

  const periodValid =
    periodStart !== "" &&
    periodEnd !== "" &&
    periodStart <= periodEnd &&
    periodEnd <= todayIso;

  return (
    <Dialog
      title="Generate usage invoice"
      description={`${accountName} — a draft built from metered usage, one line per project resource.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!periodValid || generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? "Generating…" : "Generate draft"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Period start" htmlFor="usage-period-start">
            <Input
              id="usage-period-start"
              type="date"
              required
              max={todayIso}
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </Field>
          <Field label="Period end" htmlFor="usage-period-end">
            <Input
              id="usage-period-end"
              type="date"
              required
              max={todayIso}
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </Field>
        </div>

        <p className="text-muted-foreground text-xs">
          Line items are generated automatically from recorded usage. If
          the account has no metered usage in this period, no invoice is
          created.
        </p>

        {generate.isError && (
          <p className="text-destructive text-xs">
            {errorMessage(generate.error)}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
