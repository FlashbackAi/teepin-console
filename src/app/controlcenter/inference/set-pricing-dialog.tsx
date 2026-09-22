"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import type { InferenceModel } from "@/lib/api/types";

/**
 * Set a model's customer-facing per-million-token rates.
 *
 * Input and output are priced separately because they cost very
 * differently to serve — prefill (input) is one parallel pass; decode
 * (output) generates one token at a time. Zero is valid ("do not charge"),
 * same contract as every other rate on this platform.
 */
export function SetPricingDialog({
  model,
  onClose,
}: {
  model: InferenceModel;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [inputRate, setInputRate] = useState(String(model.input_price_per_million));
  const [outputRate, setOutputRate] = useState(String(model.output_price_per_million));

  const save = useMutation({
    mutationFn: () =>
      admin.setInferenceModelPricing(model.model_route, {
        input_price_per_million: Number(inputRate),
        output_price_per_million: Number(outputRate),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "inference-models"] });
      onClose();
    },
  });

  const valid = inputRate !== "" && outputRate !== "" && Number(inputRate) >= 0 && Number(outputRate) >= 0;

  return (
    <Dialog
      title="Set pricing"
      description={model.model_route}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Price per million input tokens (USD)" hint="0 = do not charge." htmlFor="input-rate">
          <Input
            id="input-rate"
            type="number"
            step="0.01"
            min="0"
            className="tabular"
            value={inputRate}
            onChange={(e) => setInputRate(e.target.value)}
          />
        </Field>
        <Field
          label="Price per million output tokens (USD)"
          hint="0 = do not charge."
          error={save.isError ? errorMessage(save.error) : undefined}
          htmlFor="output-rate"
        >
          <Input
            id="output-rate"
            type="number"
            step="0.01"
            min="0"
            className="tabular"
            value={outputRate}
            onChange={(e) => setOutputRate(e.target.value)}
          />
        </Field>

        <p className="text-muted-foreground text-xs">
          Applies to the next completion. Usage already accrued keeps the
          rate it was metered at.
        </p>
      </div>
    </Dialog>
  );
}
