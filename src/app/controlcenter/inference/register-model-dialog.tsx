"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";

/**
 * Register (or update) a Teepin Inference catalog entry.
 *
 * Capabilities/engine only — pricing is a separate dialog
 * (set-pricing-dialog.tsx), mirroring the server's own "one endpoint per
 * rate-pair" convention so editing capabilities can never silently reset
 * a price an operator already configured.
 *
 * A freshly registered model is NOT enabled by default: JSON binding can't
 * distinguish "left blank" from "explicitly false" on a plain checkbox, so
 * the safer reading was chosen deliberately — a model stays unroutable
 * until an operator explicitly flips it on.
 */
export function RegisterModelDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();

  const [modelRoute, setModelRoute] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [costClass, setCostClass] = useState<"own" | "frontier">("own");
  const [engine, setEngine] = useState("");
  const [contextWindow, setContextWindow] = useState("");
  const [supportsTools, setSupportsTools] = useState(false);
  const [supportsVision, setSupportsVision] = useState(false);
  const [supportsAudio, setSupportsAudio] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const register = useMutation({
    mutationFn: () =>
      admin.registerInferenceModel({
        model_route: modelRoute.trim(),
        display_name: displayName.trim(),
        cost_class: costClass,
        engine: engine.trim(),
        context_window: contextWindow ? Number(contextWindow) : undefined,
        supports_tools: supportsTools,
        supports_vision: supportsVision,
        supports_audio: supportsAudio,
        enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "inference-models"] });
      onClose();
    },
  });

  const valid =
    modelRoute.trim() !== "" && displayName.trim() !== "" && engine.trim() !== "";

  return (
    <Dialog
      title="Register model"
      description="Catalog entry only — set pricing separately once registered."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!valid || register.isPending}
            onClick={() => register.mutate()}
          >
            {register.isPending ? "Registering…" : "Register"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Model route"
          hint='The key callers address, e.g. "teepin/qwen3-omni-7b" or "anthropic/claude-sonnet-5" — not the underlying backend model id.'
          htmlFor="model-route"
        >
          <Input
            id="model-route"
            placeholder="teepin/qwen3-omni-7b"
            value={modelRoute}
            onChange={(e) => setModelRoute(e.target.value)}
          />
        </Field>

        <Field label="Display name" htmlFor="display-name">
          <Input
            id="display-name"
            placeholder="Qwen3 Omni 7B"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Cost class"
            hint={
              costClass === "own"
                ? "Self-hosted — mount it on a node below."
                : "Third-party — never mounted on a node; routes straight to the registered provider."
            }
            htmlFor="cost-class"
          >
            <Select
              id="cost-class"
              value={costClass}
              onChange={(e) => setCostClass(e.target.value as "own" | "frontier")}
            >
              <option value="own">own (self-hosted)</option>
              <option value="frontier">frontier (third-party)</option>
            </Select>
          </Field>

          <Field
            label="Engine"
            hint="vllm, vllm-omni, mlx, anthropic, …"
            htmlFor="engine"
          >
            <Input
              id="engine"
              placeholder="vllm-omni"
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Context window (tokens)"
          hint="0 or blank disables the pre-dispatch fit check."
          htmlFor="context-window"
        >
          <Input
            id="context-window"
            type="number"
            min="0"
            className="tabular"
            value={contextWindow}
            onChange={(e) => setContextWindow(e.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-foreground text-xs font-medium">Capabilities</span>
          <div className="flex flex-wrap gap-4">
            <Checkbox
              id="supports-tools"
              label="Tools"
              checked={supportsTools}
              onChange={setSupportsTools}
            />
            <Checkbox
              id="supports-vision"
              label="Vision"
              checked={supportsVision}
              onChange={setSupportsVision}
            />
            <Checkbox
              id="supports-audio"
              label="Audio"
              checked={supportsAudio}
              onChange={setSupportsAudio}
            />
          </div>
        </div>

        <Checkbox
          id="enabled"
          label="Enabled (routable immediately)"
          checked={enabled}
          onChange={setEnabled}
        />

        {register.isError && (
          <p className="text-destructive text-xs">{errorMessage(register.error)}</p>
        )}
      </div>
    </Dialog>
  );
}

function Checkbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-1.5 text-sm">
      <input
        id={id}
        type="checkbox"
        className="accent-foreground h-3.5 w-3.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
