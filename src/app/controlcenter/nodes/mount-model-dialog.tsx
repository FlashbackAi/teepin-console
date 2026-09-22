"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import type { Node } from "@/lib/api/types";

/**
 * Mount a self-hosted ("own") model onto this node.
 *
 * Only cost_class="own" models are offered — a "frontier" (third-party)
 * model is never mounted on a node at all; Teepin Inference's router
 * resolves it straight to the registered provider, with no home-node
 * routing question to answer (see pkg/inferencegateway's own doc comment).
 *
 * There is deliberately no "Base URL" field: the reachable address is
 * resolved by the reconciler (pkg/inferencereconciler) after the instance
 * actually starts and reported back as observed_endpoint — an operator
 * guessing an address here would routinely be wrong for a Kubernetes-
 * managed Service anyway. Model source is a URL either way: a
 * huggingface.co link is parsed for its repo ID and handed to the
 * engine's own native downloader (multi-file repos, resuming, and
 * trust_remote_code all handled by vllm/mlx-lm's tested code, not
 * reimplemented here); any other URL is fetched by a real init container,
 * which only understands a .tar.gz/.tgz archive of a packaged model
 * directory.
 */
export function MountModelDialog({
  node,
  onClose,
}: {
  node: Node;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const models = useQuery({
    queryKey: ["admin", "inference-models"],
    queryFn: admin.listInferenceModels,
  });
  const ownModels = (models.data?.models ?? []).filter(
    (m) => m.cost_class === "own",
  );

  const [modelRoute, setModelRoute] = useState("");
  const [modelSource, setModelSource] = useState("");
  const [backendModel, setBackendModel] = useState("");
  const [cpuUnits, setCpuUnits] = useState("");
  const [memoryGb, setMemoryGb] = useState("");
  const [storageGb, setStorageGb] = useState("");
  const [gpuCount, setGpuCount] = useState("1");
  const [maxConcurrency, setMaxConcurrency] = useState("");

  const selected = ownModels.find((m) => m.model_route === modelRoute);
  // MLX runs as a host process on a native Mac node: no vCPU/storage/GPU
  // request, only the model weight footprint (used for the node memory budget).
  const isNative = selected?.engine === "mlx";

  const mount = useMutation({
    mutationFn: () =>
      admin.mountNodeService({
        node_id: node.id,
        kind: "inference_model",
        config: {
          model_route: modelRoute,
          engine: selected?.engine ?? "",
          model_source: modelSource.trim(),
          memory_gb: Number(memoryGb),
          ...(isNative
            ? {}
            : {
                cpu_units: Number(cpuUnits),
                storage_gb: Number(storageGb),
                ...(gpuCount ? { gpu_count: Number(gpuCount) } : {}),
              }),
          ...(backendModel.trim()
            ? { backend_model: backendModel.trim() }
            : {}),
          ...(maxConcurrency
            ? { max_concurrency: Number(maxConcurrency) }
            : {}),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "node-services", node.id],
      });
      onClose();
    },
  });

  const valid =
    modelRoute !== "" &&
    modelSource.trim() !== "" &&
    Number(memoryGb) > 0 &&
    (isNative || (Number(cpuUnits) > 0 && Number(storageGb) > 0));

  return (
    <Dialog
      title="Mount model"
      description={`On ${node.node_name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!valid || mount.isPending}
            onClick={() => mount.mutate()}
          >
            {mount.isPending ? "Mounting…" : "Mount"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {ownModels.length === 0 && !models.isLoading ? (
          <p className="text-muted-foreground text-sm">
            No self-hosted models registered yet — register one from the{" "}
            <span className="text-foreground">Inference</span> page first.
          </p>
        ) : (
          <Field
            label="Model"
            hint="Only self-hosted models can be mounted on a node."
            htmlFor="mount-model"
          >
            <Select
              id="mount-model"
              value={modelRoute}
              onChange={(e) => setModelRoute(e.target.value)}
            >
              <option value="">Select a model…</option>
              {ownModels.map((m) => (
                <option key={m.model_route} value={m.model_route}>
                  {m.model_route} ({m.engine})
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="Model source URL"
          hint="A huggingface.co link (repo ID is parsed out and downloaded natively by the engine), or a direct .tar.gz/.tgz URL of a packaged model directory."
          htmlFor="mount-model-source"
        >
          <Input
            id="mount-model-source"
            placeholder="https://huggingface.co/Qwen/Qwen3-Omni-7B-Instruct"
            value={modelSource}
            onChange={(e) => setModelSource(e.target.value)}
          />
        </Field>

        <div
          className={
            isNative ? "grid grid-cols-1 gap-3" : "grid grid-cols-3 gap-3"
          }
        >
          {!isNative && (
            <Field label="vCPU" htmlFor="mount-cpu-units">
              <Input
                id="mount-cpu-units"
                type="number"
                min="1"
                className="tabular"
                value={cpuUnits}
                onChange={(e) => setCpuUnits(e.target.value)}
              />
            </Field>
          )}
          <Field
            label={isNative ? "Model size in memory (GB)" : "Memory (GB)"}
            hint={
              isNative
                ? "Weight footprint. Older models on this node are unmounted automatically if this does not fit its memory budget."
                : undefined
            }
            htmlFor="mount-memory-gb"
          >
            <Input
              id="mount-memory-gb"
              type="number"
              min="1"
              className="tabular"
              value={memoryGb}
              onChange={(e) => setMemoryGb(e.target.value)}
            />
          </Field>
          {!isNative && (
            <Field
              label="Storage (GB)"
              hint="For the model/cache — survives restarts."
              htmlFor="mount-storage-gb"
            >
              <Input
                id="mount-storage-gb"
                type="number"
                min="1"
                className="tabular"
                value={storageGb}
                onChange={(e) => setStorageGb(e.target.value)}
              />
            </Field>
          )}
        </div>

        {!isNative && (
          <Field
            label="GPU count"
            hint="A whole, unsliced GPU per unit — a consumer card cannot be MIG-partitioned. 0 = CPU-only."
            htmlFor="mount-gpu-count"
          >
            <Input
              id="mount-gpu-count"
              type="number"
              min="0"
              className="tabular"
              value={gpuCount}
              onChange={(e) => setGpuCount(e.target.value)}
            />
          </Field>
        )}

        <Field
          label="Served model name (optional)"
          hint="Overrides the identifier passed to --served-model-name. Blank uses the parsed repo ID."
          htmlFor="mount-backend-model"
        >
          <Input
            id="mount-backend-model"
            placeholder="Qwen/Qwen3-Omni-7B-Instruct"
            value={backendModel}
            onChange={(e) => setBackendModel(e.target.value)}
          />
        </Field>

        <Field
          label="Max concurrency (optional)"
          hint="Blank uses the platform default (4). A Mac Mini running MLX has no internal batching — set this to 1."
          htmlFor="mount-max-concurrency"
        >
          <Input
            id="mount-max-concurrency"
            type="number"
            min="1"
            className="tabular"
            value={maxConcurrency}
            onChange={(e) => setMaxConcurrency(e.target.value)}
          />
        </Field>

        {mount.isError && (
          <p className="text-destructive text-xs">
            {errorMessage(mount.error)}
          </p>
        )}
      </div>
    </Dialog>
  );
}
