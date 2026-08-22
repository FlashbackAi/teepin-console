"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import {
  errorMessage,
  useCanProvision,
  useCreateInstance,
  useInstanceTypes,
} from "@/lib/api/hooks";
import { formatRate } from "@/lib/utils";
import {
  PriceLine,
  PaymentGateNotice,
  useAutoDetectedPort,
} from "./create-shared";

/**
 * Create a GPU instance.
 *
 * The cost is shown continuously, not at the end. A customer must never
 * discover the rate after committing — particularly because the platform
 * may allocate MORE than requested when no exact GPU slice fits, and
 * bill for what it allocated.
 *
 * CPU (home) compute has its OWN dialog + page (create-cpu-dialog.tsx) to
 * match the separate sidebar sections — this one is GPU only.
 */
export function CreateInstanceDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const types = useInstanceTypes();
  const create = useCreateInstance();
  const canProvision = useCanProvision();

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [vram, setVram] = useState("");
  const [cpuUnits, setCpuUnits] = useState(2);
  const [memory, setMemory] = useState("8GB");
  const [command, setCommand] = useState("");
  const [storageGB, setStorageGB] = useState("");
  // Manual port entry — only shown/used when auto-detection finds
  // nothing (see PortDetection in create-shared.tsx). The platform never
  // asks for a port it can already determine on its own.
  const [port, setPort] = useState("");
  const detection = useAutoDetectedPort(image);

  const available = types.data?.instance_types ?? [];
  const selected = available.find((t) => t.gpu_vram === vram);

  // Default to the smallest available GPU type once capacity is known.
  if (!vram && available.length > 0) {
    setVram(available[0].gpu_vram);
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parts = command.trim().split(/\s+/).filter(Boolean);

    let containerPort: number | undefined;
    if (detection.status === "detected") {
      containerPort = detection.port;
    } else {
      const parsed = Number(port);
      if (port.trim() && Number.isFinite(parsed) && parsed > 0) {
        containerPort = parsed;
      }
    }

    create.mutate(
      {
        name,
        image,
        gpu_vram: vram || undefined,
        cpu_units: cpuUnits,
        memory,
        command: parts.length > 0 ? [parts[0]] : undefined,
        args: parts.length > 1 ? parts.slice(1) : undefined,
        ports: containerPort ? [{ container: containerPort }] : undefined,
        storage_gb: storageGB.trim() ? Number(storageGB) : undefined,
      },
      {
        onSuccess: (instance) => {
          onClose();
          router.push(`/compute/${instance.id}`);
        },
      },
    );
  };

  const noCapacity = !types.isLoading && available.length === 0;

  return (
    <Dialog
      title="Create GPU instance"
      description="Deploy a container image on a GPU."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            form="create-instance"
            type="submit"
            disabled={
              create.isPending ||
              noCapacity ||
              canProvision === false ||
              // See create-cpu-dialog.tsx's identical guard: submitting
              // before port detection resolves would create an instance
              // with no port and silently no endpoint.
              detection.status === "unknown"
            }
          >
            {create.isPending ? "Creating…" : "Create instance"}
          </Button>
        </>
      }
    >
      <form
        id="create-instance"
        onSubmit={submit}
        className="flex flex-col gap-4"
      >
        {canProvision === false && <PaymentGateNotice onClose={onClose} />}

        <Field
          label="Name"
          hint="Lowercase letters, numbers and hyphens."
          htmlFor="name"
        >
          <Input
            id="name"
            required
            pattern="[a-z0-9-]+"
            placeholder="my-instance"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label="Container image"
          hint="Any public image, or one from your project registry."
          htmlFor="image"
        >
          <Input
            id="image"
            required
            placeholder="nvidia/cuda:12.3.1-base-ubuntu22.04"
            value={image}
            onChange={(e) => {
              setImage(e.target.value);
              // A manually-typed port belonged to the OLD image.
              setPort("");
            }}
          />
        </Field>

        {/* Many ML images — build toolchains especially — have no
            long-running entrypoint. Without a command they start, exit
            immediately and crash-loop, which looks like a platform fault
            but is the image behaving normally. Saying so here is cheaper
            than a support ticket. */}
        <Field
          label="Command"
          hint="Optional. Images without a long-running entrypoint exit immediately — e.g. sleep 3600."
          htmlFor="command"
        >
          <Input
            id="command"
            placeholder="sleep 3600"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
          />
        </Field>

        <Field
          label="Persistent storage"
          hint="Optional. Mounted at /data. Leave blank for an ephemeral instance."
          htmlFor="storage"
        >
          <Input
            id="storage"
            type="number"
            min={1}
            max={1000}
            placeholder="GB"
            value={storageGB}
            onChange={(e) => setStorageGB(e.target.value)}
          />
        </Field>

        {detection.status === "not-found" && (
          <Field
            label="Port"
            hint="We couldn't detect a port for this image — tell us which port your application listens on, or leave blank for a workload with no public endpoint. Reachable at https://<instance-id>.teepin.com once running."
            htmlFor="port"
          >
            <Input
              id="port"
              type="number"
              min={1}
              max={65535}
              placeholder="80"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </Field>
        )}

        {noCapacity ? (
          <p className="text-muted-foreground text-xs">
            No GPU capacity is available right now. Existing instances are
            unaffected.
          </p>
        ) : (
          <Field label="GPU" htmlFor="vram">
            <Select
              id="vram"
              value={vram}
              onChange={(e) => setVram(e.target.value)}
              disabled={types.isLoading}
            >
              {available.map((type) => (
                <option key={type.name} value={type.gpu_vram}>
                  {type.gpu_vram} — {formatRate(type.price_per_hour)} (
                  {type.description})
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="vCPUs" htmlFor="cpu">
            <Input
              id="cpu"
              type="number"
              min={1}
              max={64}
              value={cpuUnits}
              onChange={(e) => setCpuUnits(Number(e.target.value))}
            />
          </Field>
          <Field label="Memory" htmlFor="memory">
            <Select
              id="memory"
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
            >
              {["4GB", "8GB", "16GB", "32GB", "64GB"].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </Select>
          </Field>
        </div>

        {selected && <PriceLine rate={selected.price_per_hour} />}

        {create.isError && (
          <p className="text-destructive text-xs">
            {errorMessage(create.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}
