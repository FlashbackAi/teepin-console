"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useActiveProject } from "@/lib/active-project";
import {
  errorMessage,
  useCanProvision,
  useCreateInstance,
  useHomeCapacity,
} from "@/lib/api/hooks";
import { formatMonthly, formatRate } from "@/lib/utils";
import { PaymentGateNotice, useAutoDetectedPort } from "./create-shared";

/**
 * Create a CPU (home compute) instance.
 *
 * CPU compute is its own section (matching the sidebar). A CPU instance is
 * still a container, so it needs an image — but an ordinary Linux one, not a
 * GPU/CUDA base. vCPU/memory are free-form (bounded by what's actually free
 * on some single online home node right now), matching how the GPU dialog
 * already lets a customer pick vCPU/memory independently of GPU size —
 * there is no fixed-tier picker here anymore.
 */
export function CreateCPUInstanceDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const homeCap = useHomeCapacity();
  const create = useCreateInstance();
  const canProvision = useCanProvision();
  const { project } = useActiveProject();
  // Every CPU instance today IS home compute — there is no separate
  // reserved-CPU path (see node_class: "home" below), so turning this
  // off for a project blocks CPU instance creation entirely until
  // reserved capacity exists. Checked client-side to warn up front;
  // CreateInstance enforces it server-side regardless.
  const onDemandDisabled = project?.allow_on_demand === false;

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [cpuUnits, setCpuUnits] = useState(2);
  const [memoryGB, setMemoryGB] = useState(4);
  const [command, setCommand] = useState("");
  const [storageGB, setStorageGB] = useState("");
  // Optional, advanced P/E-core preference — left unset (the common case),
  // the platform either bills via cpu_units alone (a node with no detected
  // split) or picks a proportional default. Only pCoresInput is state;
  // eCoresInput is DERIVED as the remainder of cpuUnits so the two can
  // never disagree with the vCPU count above.
  const [pCoresInput, setPCoresInput] = useState("");
  const wantsPESplit = pCoresInput.trim() !== "";
  const pCoresValue = wantsPESplit
    ? Math.max(0, Math.min(cpuUnits, Number(pCoresInput) || 0))
    : 0;
  const eCoresValue = wantsPESplit ? cpuUnits - pCoresValue : 0;
  // Manual port entry — only ever used/shown when auto-detection finds
  // nothing (see PortDetection). When the platform already knows the
  // port (the common case: nginx, postgres, redis, ...), the customer is
  // never asked at all.
  const [port, setPort] = useState("");
  const detection = useAutoDetectedPort(image);

  const maxCPU = homeCap.data?.max_free_cpu_cores ?? 0;
  const maxMemGB = homeCap.data?.max_free_memory_gb ?? 0;
  // A workload runs on ONE node, not spread across the fleet — the request
  // must fit within some single node's free capacity, same rule the old
  // tier-fitment check used (capacity.go's MaxFreeCPU/MaxFreeMemGB).
  const fits =
    maxCPU > 0 && maxMemGB > 0 && cpuUnits <= maxCPU && memoryGB <= maxMemGB;
  // Same formula the backend prices with (HomeCapacitySummary's
  // CPUCoreRate/MemoryGBRate) — a live quote as the customer types, not a
  // round trip per keystroke. Equals what metering will actually bill.
  const pricePerHour =
    cpuUnits * (homeCap.data?.cpu_core_rate_per_hour ?? 0) +
    memoryGB * (homeCap.data?.memory_gb_rate_per_hour ?? 0);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parts = command.trim().split(/\s+/).filter(Boolean);
    if (!fits) return;

    // Detected takes priority — that field is never shown, so there is
    // nothing for the customer to have typed over it. Only when
    // detection found nothing does the manual field's value apply.
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
        node_class: "home",
        cpu_units: cpuUnits,
        memory: `${memoryGB}GB`,
        command: parts.length > 0 ? [parts[0]] : undefined,
        args: parts.length > 1 ? parts.slice(1) : undefined,
        ports: containerPort ? [{ container: containerPort }] : undefined,
        storage_gb: storageGB.trim() ? Number(storageGB) : undefined,
        p_cores: wantsPESplit ? pCoresValue : undefined,
        e_cores: wantsPESplit ? eCoresValue : undefined,
      },
      {
        onSuccess: (instance) => {
          onClose();
          router.push(`/compute/${instance.id}`);
        },
      },
    );
  };

  const noCapacity = !homeCap.isLoading && maxCPU === 0 && maxMemGB === 0;
  const nothingFits = !homeCap.isLoading && !noCapacity && !fits;

  return (
    <Dialog
      title="Create CPU instance"
      description="Deploy a container image on home CPU compute."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            form="create-cpu-instance"
            type="submit"
            disabled={
              create.isPending ||
              canProvision === false ||
              onDemandDisabled ||
              noCapacity ||
              nothingFits ||
              !fits ||
              // Port detection is a debounced network lookup — it must
              // resolve (found, or confirmed not-found) before submit,
              // or a fast submit races ahead of it and the instance is
              // created with no port at all, silently, with no endpoint.
              detection.status === "unknown"
            }
          >
            {create.isPending ? "Creating…" : "Create instance"}
          </Button>
        </>
      }
    >
      <form
        id="create-cpu-instance"
        onSubmit={submit}
        className="flex flex-col gap-4"
      >
        {canProvision === false && <PaymentGateNotice onClose={onClose} />}

        {onDemandDisabled && (
          <p className="text-warning text-xs">
            On-demand (home-node) capacity is turned off for this project,
            and no reserved capacity is available yet — CPU instances
            cannot be created here. Enable on-demand capacity in{" "}
            <span className="font-medium">Project settings</span> to
            continue.
          </p>
        )}

        <Field
          label="Name"
          hint="Lowercase letters, numbers and hyphens."
          htmlFor="cpu-name"
        >
          <Input
            id="cpu-name"
            required
            pattern="[a-z0-9-]+"
            placeholder="my-instance"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label="Container image"
          hint="Any public Linux image, or one from your project registry."
          htmlFor="cpu-image"
        >
          <Input
            id="cpu-image"
            required
            placeholder="nginx  ·  python:3.12-slim  ·  ubuntu:22.04"
            value={image}
            onChange={(e) => {
              setImage(e.target.value);
              // A manually-typed port belonged to the OLD image; carrying
              // it over to a new one could silently submit the wrong
              // port for what the customer just switched to.
              setPort("");
            }}
          />
        </Field>

        <Field
          label="Command"
          hint="Optional. Images without a long-running entrypoint exit immediately — e.g. sleep 3600."
          htmlFor="cpu-command"
        >
          <Input
            id="cpu-command"
            placeholder="sleep 3600"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
          />
        </Field>

        <Field
          label="Persistent storage"
          hint="Optional. Mounted at /data. Leave blank for an ephemeral instance."
          htmlFor="cpu-storage"
        >
          <Input
            id="cpu-storage"
            type="number"
            min={1}
            max={1000}
            placeholder="GB"
            value={storageGB}
            onChange={(e) => setStorageGB(e.target.value)}
          />
        </Field>
        {Number(storageGB) > 0 && (
          // Home nodes are the only capacity that exists today, so this
          // warning is not hypothetical — every volume created from this
          // dialog IS node-local. Stated plainly rather than buried in
          // docs: a customer discovering this by surprise when their node
          // goes offline is the exact outcome to avoid.
          <p className="text-warning text-xs">
            This volume lives on the home node&apos;s own disk — it is
            unreachable while that node is offline, and is not backed up.
            This is a different durability guarantee than datacenter
            storage.
          </p>
        )}

        {detection.status === "not-found" && (
          <Field
            label="Port"
            hint="We couldn't detect a port for this image — tell us which port your application listens on, or leave blank for a workload with no public endpoint. Reachable at https://<instance-id>.teepin.com once running."
            htmlFor="cpu-port"
          >
            <Input
              id="cpu-port"
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
          // See create-dialog.tsx's identical fix: matches the vCPU/Memory
          // fields' own label+body shape rather than a lone floating
          // paragraph, which visually collapsed to less height than the
          // real size inputs it stands in for.
          <div className="flex flex-col gap-1.5">
            <span className="text-foreground text-xs font-medium">Size</span>
            <p className="text-muted-foreground text-xs">
              No home compute capacity is available. A node must be enrolled
              and given a reservation before CPU instances can run.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="vCPUs"
              hint={`Up to ${maxCPU} free right now`}
              htmlFor="cpu-units"
            >
              <Input
                id="cpu-units"
                type="number"
                min={1}
                max={maxCPU || undefined}
                value={cpuUnits}
                onChange={(e) => setCpuUnits(Number(e.target.value))}
                disabled={homeCap.isLoading}
              />
            </Field>
            <Field
              label="Memory (GB)"
              hint={`Up to ${maxMemGB} free right now`}
              htmlFor="cpu-memory"
            >
              <Input
                id="cpu-memory"
                type="number"
                min={1}
                max={maxMemGB || undefined}
                value={memoryGB}
                onChange={(e) => setMemoryGB(Number(e.target.value))}
                disabled={homeCap.isLoading}
              />
            </Field>
          </div>
        )}

        {nothingFits && (
          <p className="text-muted-foreground text-xs">
            No home node currently has this much free capacity in one place.
            Try a smaller size, or again once capacity frees up.
          </p>
        )}

        {!noCapacity && (
          <details className="hairline rounded-md border-border px-3 py-2.5">
            <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
              Advanced: P-core / E-core split
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              <Field
                label="P-cores"
                hint={
                  wantsPESplit
                    ? `E-cores set automatically to the remainder (${eCoresValue}) of your ${cpuUnits} vCPUs.`
                    : "Leave blank to let the platform choose — either bills as plain vCPUs (no split detected on the node) or splits proportionally to what's free."
                }
                htmlFor="cpu-pcores"
              >
                <Input
                  id="cpu-pcores"
                  type="number"
                  min={0}
                  max={cpuUnits}
                  placeholder="No preference"
                  value={pCoresInput}
                  onChange={(e) => setPCoresInput(e.target.value)}
                />
              </Field>
            </div>
          </details>
        )}

        {fits && (
          <div className="hairline flex items-baseline justify-between rounded-md border-border bg-muted/50 px-3 py-2.5">
            <span className="text-muted-foreground text-xs">
              Billed while running
            </span>
            <span className="text-right">
              <span className="tabular text-foreground block text-sm font-medium">
                {formatMonthly(pricePerHour)}
              </span>
              {/* The exact hourly rate metering charges — so the quote the
                  customer sees equals the bill, without sub-cent rounding. */}
              <span className="text-muted-foreground tabular block text-xs">
                {formatRate(pricePerHour)}
              </span>
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
