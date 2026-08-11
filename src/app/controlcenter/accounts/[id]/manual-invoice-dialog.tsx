"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { admin, type ManualLineItem } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import { formatCost } from "@/lib/utils";
import type { Project } from "@/lib/api/types";

/**
 * Manual invoice builder.
 *
 * For negotiated deals: a price agreed by email, billed as a flat rate,
 * while the platform keeps metering usage in the background. That means
 * the switch to usage-based billing later is a change of policy, not a
 * change of system.
 *
 * ACCOUNT-scoped, not project-scoped — one invoice can cover an
 * account's activity across every project it has, the same way one AWS
 * bill covers every service under one account. Each line item may
 * optionally be attributed to one of the account's projects for the
 * per-project breakdown; a line with no project is an account-wide
 * charge (platform fee, setup cost, credit).
 *
 * Created as a DRAFT. Issuing is a separate, deliberate step — an
 * operator building an invoice for someone else's account should be able
 * to check the numbers before it becomes something the customer owes.
 */

type DraftLine = {
  description: string;
  projectId: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: string;
};

const emptyLine: DraftLine = {
  description: "",
  projectId: "",
  quantity: "",
  unit: "",
  unitPrice: "",
  amount: "",
};

export function ManualInvoiceDialog({
  accountId,
  accountName,
  projects,
  onClose,
}: {
  accountId: string;
  accountName: string;
  projects: Project[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const today = new Date();
  const todayIso = iso(today);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // A billing period covers activity that has already happened, so it
  // cannot extend past today — the period defaults to "start of month →
  // today", and both inputs are capped at today (max=todayIso). The
  // backend enforces the same rule; the cap just stops the operator
  // picking a future date in the first place. The due date is exempt —
  // "due in 30 days" is a future date by design.
  const [periodStart, setPeriodStart] = useState(iso(firstOfMonth));
  const [periodEnd, setPeriodEnd] = useState(todayIso);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...emptyLine }]);

  const create = useMutation({
    mutationFn: (body: Parameters<typeof admin.createManualInvoice>[0]) =>
      admin.createManualInvoice(body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "invoices", accountId],
      });
      onClose();
    },
  });

  const total = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);

  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };

        // Derive the amount when quantity and unit price are both given,
        // but never overwrite an amount the operator typed directly — a
        // negotiated flat price has no meaningful quantity, and guessing
        // would silently change the number being billed.
        if (
          (patch.quantity !== undefined || patch.unitPrice !== undefined) &&
          next.quantity !== "" &&
          next.unitPrice !== ""
        ) {
          const computed = Number(next.quantity) * Number(next.unitPrice);
          if (Number.isFinite(computed)) {
            next.amount = computed.toFixed(2);
          }
        }
        return next;
      }),
    );
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    const lineItems: ManualLineItem[] = lines
      .filter((line) => line.description.trim() !== "")
      .map((line) => ({
        description: line.description.trim(),
        project_id: line.projectId || undefined,
        quantity: line.quantity === "" ? undefined : Number(line.quantity),
        unit: line.unit.trim() || undefined,
        unit_price:
          line.unitPrice === "" ? undefined : Number(line.unitPrice),
        amount: Number(line.amount) || 0,
      }));

    create.mutate({
      account_id: accountId,
      period_start: periodStart,
      period_end: periodEnd,
      due_date: dueDate || undefined,
      notes: notes.trim() || undefined,
      line_items: lineItems,
    });
  };

  // Period must not run backwards or past today. Mirrors the backend
  // guard so an operator sees the button stay disabled rather than
  // getting a round-trip error. (max= on the inputs blocks the picker,
  // but a typed value can still land out of range.)
  const periodValid =
    periodStart !== "" &&
    periodEnd !== "" &&
    periodStart <= periodEnd &&
    periodEnd <= todayIso;

  const valid =
    lines.some((line) => line.description.trim() !== "" && line.amount !== "") &&
    periodValid;

  return (
    <Dialog
      title="Issue invoice"
      description={`${accountName} — created as a draft you can review before issuing.`}
      onClose={onClose}
      className="max-w-4xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            form="manual-invoice"
            type="submit"
            disabled={!valid || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create draft"}
          </Button>
        </>
      }
    >
      <form id="manual-invoice" onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Period start" htmlFor="period-start">
            <Input
              id="period-start"
              type="date"
              required
              max={todayIso}
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </Field>
          <Field label="Period end" htmlFor="period-end">
            <Input
              id="period-end"
              type="date"
              required
              max={todayIso}
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </Field>
          <Field label="Due date" hint="Optional." htmlFor="due-date">
            <Input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-foreground text-xs font-medium">
            Line items
          </span>

          {/* Column headers, so an operator entering a rate knows which
              box means what without clicking into it. */}
          <div className="text-muted-foreground grid grid-cols-[1fr_120px_70px_70px_80px_80px_28px] gap-2 text-[11px]">
            <span>Description</span>
            <span>Project</span>
            <span>Quantity</span>
            <span>Unit</span>
            <span>Unit price</span>
            <span>Amount</span>
            <span />
          </div>

          {lines.map((line, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_120px_70px_70px_80px_80px_28px] gap-2"
            >
              <Input
                aria-label={`Line ${index + 1} description`}
                placeholder="GPU compute — negotiated rate"
                value={line.description}
                onChange={(e) =>
                  updateLine(index, { description: e.target.value })
                }
              />
              <Select
                aria-label={`Line ${index + 1} project`}
                value={line.projectId}
                onChange={(e) =>
                  updateLine(index, { projectId: e.target.value })
                }
              >
                <option value="">Account-wide</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
              <Input
                aria-label={`Line ${index + 1} quantity`}
                type="number"
                step="0.0001"
                value={line.quantity}
                onChange={(e) =>
                  updateLine(index, { quantity: e.target.value })
                }
              />
              <Input
                aria-label={`Line ${index + 1} unit`}
                placeholder="hours"
                value={line.unit}
                onChange={(e) => updateLine(index, { unit: e.target.value })}
              />
              <Input
                aria-label={`Line ${index + 1} unit price`}
                type="number"
                step="0.0001"
                value={line.unitPrice}
                onChange={(e) =>
                  updateLine(index, { unitPrice: e.target.value })
                }
              />
              <Input
                aria-label={`Line ${index + 1} amount`}
                type="number"
                step="0.01"
                className="tabular"
                value={line.amount}
                onChange={(e) => updateLine(index, { amount: e.target.value })}
              />
              <button
                type="button"
                aria-label={`Remove line ${index + 1}`}
                onClick={() =>
                  setLines((current) =>
                    current.length === 1
                      ? [{ ...emptyLine }]
                      : current.filter((_, i) => i !== index),
                  )
                }
                className="text-muted-foreground hover:text-foreground flex h-8 w-7 items-center justify-center rounded"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLines((current) => [...current, { ...emptyLine }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add line
            </Button>
          </div>
        </div>

        <Field label="Notes" hint="Appears on the invoice." htmlFor="notes">
          <Input
            id="notes"
            placeholder="Optional"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {/* The number being billed, shown before the button. */}
        <div className="hairline flex items-baseline justify-between rounded-md border-border bg-muted/50 px-3 py-2.5">
          <span className="text-muted-foreground text-xs">Invoice total</span>
          <span className="tabular text-foreground text-sm font-medium">
            {formatCost(total)}
          </span>
        </div>

        {create.isError && (
          <p className="text-destructive text-xs">
            {errorMessage(create.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
