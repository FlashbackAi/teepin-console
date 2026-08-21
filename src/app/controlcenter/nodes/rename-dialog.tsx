"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import type { Node } from "@/lib/api/types";

/** Rename a node's operator label. */
export function RenameNodeDialog({
  node,
  onClose,
}: {
  node: Node;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(node.node_name);

  const save = useMutation({
    mutationFn: () => admin.renameNode(node.id, name.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "nodes"] });
      onClose();
    },
  });

  return (
    <Dialog
      title="Rename node"
      description="Operator label only — does not change the node's identity."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={name.trim() === "" || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <Field label="Name" htmlFor="node-rename">
        <Input
          id="node-rename"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      {save.isError && (
        <p className="text-destructive mt-2 text-xs">
          {errorMessage(save.error)}
        </p>
      )}
    </Dialog>
  );
}
