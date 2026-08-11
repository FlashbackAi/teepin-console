"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";

/**
 * Grant credit.
 *
 * An operator mints spendable value here, so the server enforces
 * guardrails (amount cap, required reason, future expiry) and this form
 * surfaces them. Credits are spent before the customer's card is ever
 * charged — they do NOT waive the card requirement.
 */
export function GrantCreditDialog({
  accountId,
  accountName,
  onClose,
}: {
  accountId: string;
  accountName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const grant = useMutation({
    mutationFn: () =>
      admin.grantCredit(accountId, {
        amount: Number(amount),
        reason: reason.trim(),
        expires_at: expiresAt || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "credits", accountId],
      });
      onClose();
    },
  });

  const valid = Number(amount) > 0 && reason.trim() !== "";

  return (
    <Dialog
      title="Grant credit"
      description={`${accountName} — spent before the card is charged.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!valid || grant.isPending}
            onClick={() => grant.mutate()}
          >
            {grant.isPending ? "Granting…" : "Grant credit"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Amount (USD)" htmlFor="credit-amount">
          <Input
            id="credit-amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="500"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field
          label="Reason"
          hint="Recorded on the ledger — required."
          htmlFor="credit-reason"
        >
          <Input
            id="credit-reason"
            placeholder="Design partner — Q3 pilot"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Field label="Expires" hint="Optional." htmlFor="credit-expiry">
          <Input
            id="credit-expiry"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </Field>

        {grant.isError && (
          <p className="text-destructive text-xs">
            {errorMessage(grant.error)}
          </p>
        )}
      </div>
    </Dialog>
  );
}
