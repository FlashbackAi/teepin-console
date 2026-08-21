"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import type { Node } from "@/lib/api/types";

/**
 * Set a node's rentable capacity.
 *
 * The node's DETECTED specs are the ceiling — the operator chooses how much of
 * them to offer for rent, keeping the rest for their own use. The server
 * rejects any value above the detected specs (over-commit).
 */
export function ReservationDialog({
  node,
  onClose,
}: {
  node: Node;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [cpu, setCpu] = useState(String(node.rentable_cpu_cores ?? 0));
  const [mem, setMem] = useState(String(node.rentable_memory_gb ?? 0));

  const save = useMutation({
    mutationFn: () =>
      admin.setNodeReservation(node.id, {
        cpu_cores: Number(cpu),
        memory_gb: Number(mem),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "nodes"] });
      onClose();
    },
  });

  const detectedCpu = node.cpu_cores ?? 0;
  const detectedMem = node.memory_gb ?? 0;
  const overCommit = Number(cpu) > detectedCpu || Number(mem) > detectedMem;

  return (
    <Dialog
      title="Set rentable capacity"
      description={`${node.node_name} — offer part of its ${detectedCpu} vCPU / ${detectedMem} GB for rent.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={overCommit || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Rentable vCPU"
          hint={`Up to ${detectedCpu} (detected). The node keeps the rest for you.`}
          htmlFor="res-cpu"
        >
          <Input
            id="res-cpu"
            type="number"
            min="0"
            max={detectedCpu}
            className="tabular"
            value={cpu}
            onChange={(e) => setCpu(e.target.value)}
          />
        </Field>
        <Field
          label="Rentable memory (GB)"
          hint={`Up to ${detectedMem} (detected).`}
          htmlFor="res-mem"
        >
          <Input
            id="res-mem"
            type="number"
            min="0"
            max={detectedMem}
            className="tabular"
            value={mem}
            onChange={(e) => setMem(e.target.value)}
          />
        </Field>

        {overCommit && (
          <p className="text-destructive text-xs">
            Cannot offer more than the node has detected ({detectedCpu} vCPU /{" "}
            {detectedMem} GB).
          </p>
        )}
        {save.isError && (
          <p className="text-destructive text-xs">{errorMessage(save.error)}</p>
        )}
      </div>
    </Dialog>
  );
}
