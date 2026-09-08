"use client";

/**
 * The pre-deploy cost-approval gate (KUMBHA-DESIGN.md's "Pre-deploy cost
 * approval" section) — the console half of a hard backend gate, not a
 * courtesy confirmation. Approving here calls the exact endpoint
 * teepin-mcp-server's provisioning verbs check server-side before making
 * any real API call; a customer who never approves has paid only for the
 * agent's own reasoning, never for infrastructure.
 */

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { errorMessage, useApproveKumbhaDeploy } from "@/lib/api/hooks";
import { formatCost } from "@/lib/utils";
import type { DeploymentPlan } from "@/lib/api/types";

export function DeploymentPlanModal({
  plan,
  sessionId,
  deployApproved,
  onDismiss,
}: {
  plan: DeploymentPlan;
  sessionId: string;
  /** True once the customer has already approved a deployment on this
   *  session — reached only via "Review deployment plan" (see page.tsx's
   *  manualReviewOpen), never the first-time auto-popup, which stops
   *  offering itself the instant this flips true. Swaps the actionable
   *  Approve/Cancel footer for a plain acknowledgement: re-showing "Not
   *  yet" / "Approve & deploy" for something already approved and
   *  running reads as broken, not as a review (found live 2026-08-31:
   *  "the button doesn't show anything post approval"). */
  deployApproved: boolean;
  onDismiss: () => void;
}) {
  const approve = useApproveKumbhaDeploy(sessionId);

  return (
    <Dialog
      title="Deployment plan"
      description={
        deployApproved
          ? "Already approved — this is what's billing now."
          : "Review what this will cost to run before any real infrastructure is created."
      }
      onClose={onDismiss}
      className="max-w-xl"
      footer={
        deployApproved ? (
          <Button variant="secondary" size="sm" onClick={onDismiss}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Not yet
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={approve.isPending}
              onClick={() => approve.mutate(undefined, { onSuccess: onDismiss })}
            >
              {approve.isPending ? "Approving…" : "Approve & deploy"}
            </Button>
          </>
        )
      }
    >
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Resource</TH>
            <TH>Sized</TH>
            <TH className="text-right">Cost/hr</TH>
          </TR>
        </THead>
        <TBody>
          {plan.resources.map((r, i) => (
            <TR key={i} className="hover:bg-transparent">
              <TD className="text-foreground">{r.name}</TD>
              <TD className="text-muted-foreground">
                {[
                  r.cpu_units ? `${r.cpu_units} vCPU` : null,
                  r.memory_gb ? `${r.memory_gb}GB RAM` : null,
                  r.storage_gb ? `${r.storage_gb}GB storage` : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </TD>
              <TD className="tabular text-foreground text-right">
                {formatCost(r.cost_per_hour)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="hairline-t border-border mt-1 flex items-baseline justify-between px-3 py-2.5">
        <span className="text-foreground text-sm font-medium">
          Total estimated cost
        </span>
        <span className="tabular text-foreground text-sm font-medium">
          {formatCost(plan.total_cost_per_hour)}/hr
        </span>
      </div>

      <p className="text-muted-foreground mt-2 text-xs">
        ~{formatCost(plan.total_cost_per_month)}/month if left running.
        Billed at ordinary Teepin compute/storage rates — this is not a
        separate Kumbha charge
        {deployApproved ? "." : ", and it starts only once you approve."}
      </p>

      {approve.isError && (
        <p className="text-destructive mt-2 text-xs">
          {errorMessage(approve.error)}
        </p>
      )}
    </Dialog>
  );
}
