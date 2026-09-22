"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import type { KumbhaCandidateInput, KumbhaCandidateView } from "@/lib/api/types";

/**
 * Create or edit one backend candidate for a route — provider type, where
 * it lives, priority against any others on the same route, and (write-only)
 * its API key. Nothing here needs a redeploy: the running server rebuilds
 * this candidate's backend connection the moment this save completes (see
 * pkg/kumbha/factory.go's own doc comment), and a rotated key is picked up
 * within secretCacheTTL (30s) even without that.
 *
 * routeName is fixed for an edit (a candidate's route is immutable once
 * created — moving it is delete-then-create) and free text for a brand-new
 * candidate, which is what lets an operator register a whole new route
 * ("teepin/openai", say) with no code change at all.
 */
export function CandidateDialog({
  routeName,
  candidate,
  onClose,
}: {
  /** Fixed route name when editing; the route this new candidate joins
   *  when creating one from an existing route's row. Omit only when
   *  creating a candidate for a brand-new route (routeNameInput is then
   *  editable). */
  routeName: string;
  /** undefined = creating a new candidate. */
  candidate?: KumbhaCandidateView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isNewRoute = routeName === "";

  const [routeNameInput, setRouteNameInput] = useState(routeName);
  const [providerType, setProviderType] = useState<"vllm" | "anthropic">(
    candidate?.provider_type ?? "vllm",
  );
  const [baseURL, setBaseURL] = useState(candidate?.base_url ?? "");
  const [model, setModel] = useState(candidate?.model ?? "");
  const [priority, setPriority] = useState(String(candidate?.priority ?? 0));
  const [contextWindow, setContextWindow] = useState(
    String(candidate?.context_window ?? 8000),
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    String(candidate?.max_output_tokens ?? 4096),
  );
  const [supportsTools, setSupportsTools] = useState(
    candidate?.supports_tools ?? true,
  );
  const [enabled, setEnabled] = useState(candidate?.enabled ?? true);
  // Write-only: never pre-filled from candidate.has_secret, since the
  // actual value never comes back from the API. Left blank on an edit
  // means "keep whatever key is already stored" — see admin.ts's own doc
  // comment on updateKumbhaCandidate.
  const [apiKey, setApiKey] = useState("");

  const input: KumbhaCandidateInput = {
    route_name: routeNameInput.trim(),
    priority: Number(priority) || 0,
    provider_type: providerType,
    base_url: baseURL.trim(),
    model: model.trim(),
    context_window: Number(contextWindow) || 0,
    supports_tools: supportsTools,
    max_output_tokens: Number(maxOutputTokens) || 4096,
    enabled,
    ...(apiKey ? { api_key: apiKey } : {}),
  };

  const save = useMutation({
    mutationFn: () =>
      candidate
        ? admin.updateKumbhaCandidate(candidate.id, input)
        : admin.createKumbhaCandidate(input),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "kumbha-routes"] });
      if (res.warning) {
        // The row still saved — only the key write failed. Surface it
        // rather than silently closing as if everything succeeded.
        alert(res.warning);
      }
      onClose();
    },
  });

  const valid =
    routeNameInput.trim() !== "" &&
    model.trim() !== "" &&
    (providerType !== "vllm" || baseURL.trim() !== "");

  return (
    <Dialog
      title={candidate ? "Edit backend" : "Add backend"}
      description={isNewRoute ? undefined : routeName}
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
        {isNewRoute && (
          <Field
            label="Route name"
            hint='Customer-facing route, e.g. "teepin/openai". Never shown to a customer as a backend identity — just the name they address.'
            htmlFor="cand-route"
          >
            <Input
              id="cand-route"
              value={routeNameInput}
              onChange={(e) => setRouteNameInput(e.target.value)}
              placeholder="teepin/fast"
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider type" htmlFor="cand-provider">
            <Select
              id="cand-provider"
              value={providerType}
              onChange={(e) =>
                setProviderType(e.target.value as "vllm" | "anthropic")
              }
            >
              <option value="vllm">vLLM-compatible</option>
              <option value="anthropic">Anthropic</option>
            </Select>
          </Field>
          <Field
            label="Priority"
            hint="Lower tried first."
            htmlFor="cand-priority"
          >
            <Input
              id="cand-priority"
              type="number"
              className="tabular"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </Field>
        </div>

        {providerType === "vllm" && (
          <Field
            label="Base URL"
            hint="e.g. https://dev-api.teepin.com or a direct vLLM endpoint."
            htmlFor="cand-baseurl"
          >
            <Input
              id="cand-baseurl"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://…"
            />
          </Field>
        )}

        <Field
          label="Model"
          hint={
            providerType === "anthropic"
              ? 'Anthropic model id, e.g. "claude-haiku-4-5-20251001".'
              : "The model id this backend serves."
          }
          htmlFor="cand-model"
        >
          <Input
            id="cand-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Context window" htmlFor="cand-context">
            <Input
              id="cand-context"
              type="number"
              className="tabular"
              value={contextWindow}
              onChange={(e) => setContextWindow(e.target.value)}
            />
          </Field>
          {providerType === "anthropic" && (
            <Field label="Max output tokens" htmlFor="cand-maxout">
              <Input
                id="cand-maxout"
                type="number"
                className="tabular"
                value={maxOutputTokens}
                onChange={(e) => setMaxOutputTokens(e.target.value)}
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Supports tools" htmlFor="cand-tools">
            <Select
              id="cand-tools"
              value={supportsTools ? "yes" : "no"}
              onChange={(e) => setSupportsTools(e.target.value === "yes")}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Enabled" htmlFor="cand-enabled">
            <Select
              id="cand-enabled"
              value={enabled ? "yes" : "no"}
              onChange={(e) => setEnabled(e.target.value === "yes")}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
        </div>

        <Field
          label="API key"
          hint={
            candidate?.has_secret
              ? "A key is already set. Leave blank to keep it — only fill this in to rotate it."
              : "Stored in AWS Secrets Manager, never shown again. Leave blank for an unauthenticated backend."
          }
          error={save.isError ? errorMessage(save.error) : undefined}
          htmlFor="cand-apikey"
        >
          <Input
            id="cand-apikey"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={candidate?.has_secret ? "••••••••" : ""}
          />
        </Field>
      </div>
    </Dialog>
  );
}
