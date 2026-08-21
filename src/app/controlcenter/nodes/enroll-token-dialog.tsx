"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";

/**
 * Mint a node enrollment token.
 *
 * The class is chosen HERE, by the operator, and travels with the token —
 * the enrolling agent never names its class and cannot self-elevate to
 * datacenter. The plaintext token is shown exactly once: it is the machine's
 * one-time key to exchange for its own credential.
 */
export function EnrollTokenDialog({
  onClose,
  defaultLabel = "",
  defaultClass = "home",
}: {
  onClose: () => void;
  /** Prefill for "regenerate token for this node" — the operator can still
   *  edit them. */
  defaultLabel?: string;
  defaultClass?: "home" | "datacenter";
}) {
  const [label, setLabel] = useState(defaultLabel);
  const [nodeClass, setNodeClass] = useState<"home" | "datacenter">(
    defaultClass,
  );
  const [issued, setIssued] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      admin.createNodeEnrollmentToken({
        label: label.trim(),
        class: nodeClass,
      }),
    onSuccess: (data) => setIssued(data.token),
  });

  // Once issued, the dialog becomes a one-time reveal — the token cannot be
  // recovered later, so the operator must copy it now.
  if (issued) {
    return (
      <Dialog
        title="Enrollment token"
        description="Copy this now — it is shown only once and cannot be recovered."
        onClose={onClose}
        footer={
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <code className="bg-muted text-foreground block flex-1 rounded p-3 text-xs break-all">
              {issued}
            </code>
            <CopyButton value={issued} />
          </div>
          <p className="text-muted-foreground text-xs">
            Run on the machine (Linux, with the agent installed):
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-muted text-muted-foreground block flex-1 rounded p-3 text-xs break-all">
              teepin-agent enroll --token {issued}
            </code>
            <CopyButton value={`teepin-agent enroll --token ${issued}`} />
          </div>
        </div>
      </Dialog>
    );
  }

  const valid = label.trim() !== "";

  return (
    <Dialog
      title="Generate enrollment token"
      description="One-time, class-bearing, and short-lived."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!valid || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Generating…" : "Generate token"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Label"
          hint="Which machine is this for?"
          htmlFor="node-label"
        >
          <Input
            id="node-label"
            placeholder="mac-mini"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>

        <Field
          label="Class"
          hint="Fixed by the token — the agent cannot change it."
          htmlFor="node-class"
        >
          <select
            id="node-class"
            className="border-border bg-background text-foreground h-9 rounded border px-2 text-sm"
            value={nodeClass}
            onChange={(e) =>
              setNodeClass(e.target.value as "home" | "datacenter")
            }
          >
            <option value="home">home (consumer-grade CPU)</option>
            <option value="datacenter">datacenter (GPU fleet)</option>
          </select>
        </Field>

        {create.isError && (
          <p className="text-destructive text-xs">
            {errorMessage(create.error)}
          </p>
        )}
      </div>
    </Dialog>
  );
}
