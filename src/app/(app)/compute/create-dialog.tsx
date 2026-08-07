"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import {
  errorMessage,
  useCreateInstance,
  useInstanceTypes,
} from "@/lib/api/hooks";
import { formatRate } from "@/lib/utils";

/**
 * Create instance.
 *
 * The cost is shown continuously, not at the end. A customer must never
 * discover the rate after committing — particularly because the platform
 * may allocate MORE than requested when no exact GPU slice fits, and
 * bill for what it allocated.
 */
export function CreateInstanceDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  // The dialog only opens once the key is ready (the button is disabled
  // until then), so no gate is needed here.
  const types = useInstanceTypes();
  const create = useCreateInstance();

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [vram, setVram] = useState("");
  const [cpuUnits, setCpuUnits] = useState(2);
  const [memory, setMemory] = useState("8GB");
  const [command, setCommand] = useState("");

  const available = types.data?.instance_types ?? [];
  const selected = available.find((t) => t.gpu_vram === vram);

  // Default to the smallest available type once capacity is known.
  if (!vram && available.length > 0) {
    setVram(available[0].gpu_vram);
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    // Split on whitespace into command + args, the way a shell would.
    // The API takes them separately (command overrides ENTRYPOINT, args
    // overrides CMD), but customers think in terms of one command line.
    const parts = command.trim().split(/\s+/).filter(Boolean);

    create.mutate(
      {
        name,
        image,
        gpu_vram: vram || undefined,
        cpu_units: cpuUnits,
        memory,
        command: parts.length > 0 ? [parts[0]] : undefined,
        args: parts.length > 1 ? parts.slice(1) : undefined,
      },
      {
        onSuccess: (instance) => {
          onClose();
          // Straight to the detail page: the instance is `pending` and
          // the customer wants to watch it start, not hunt for it in a
          // list.
          router.push(`/compute/${instance.id}`);
        },
      },
    );
  };

  const noCapacity = !types.isLoading && available.length === 0;

  return (
    <Dialog
      title="Create instance"
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
            disabled={create.isPending || noCapacity}
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
            onChange={(e) => setImage(e.target.value)}
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

        {/* The number the customer is agreeing to. Shown before the
            button, never after the click. */}
        {selected && (
          <div className="hairline flex items-baseline justify-between rounded-md border-border bg-muted/50 px-3 py-2.5">
            <span className="text-muted-foreground text-xs">
              Billed while running
            </span>
            <span className="tabular text-foreground text-sm font-medium">
              {formatRate(selected.price_per_hour)}
            </span>
          </div>
        )}

        {create.isError && (
          <p className="text-destructive text-xs">
            {errorMessage(create.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}
