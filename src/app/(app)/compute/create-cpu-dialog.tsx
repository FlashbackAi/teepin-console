"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
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
 * GPU/CUDA base. Size is chosen from fixed tiers; only tiers that FIT the
 * available home capacity right now are selectable.
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
  const [tierId, setTierId] = useState("");
  const [command, setCommand] = useState("");
  const [storageGB, setStorageGB] = useState("");
  // Manual port entry — only ever used/shown when auto-detection finds
  // nothing (see PortDetection). When the platform already knows the
  // port (the common case: nginx, postgres, redis, ...), the customer is
  // never asked at all.
  const [port, setPort] = useState("");
  const detection = useAutoDetectedPort(image);

  const tiers = homeCap.data?.tiers ?? [];
  const selected = tiers.find((t) => t.id === tierId);

  // Default to the first tier that fits.
  if (!tierId && tiers.length > 0) {
    setTierId((tiers.find((t) => t.fits) ?? tiers[0]).id);
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parts = command.trim().split(/\s+/).filter(Boolean);
    if (!selected) return;

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
        cpu_units: selected.cpu_units,
        memory: `${selected.memory_gb}GB`,
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

  const noCapacity = !homeCap.isLoading && tiers.length === 0;
  const nothingFits = tiers.length > 0 && !tiers.some((t) => t.fits);

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
              !selected?.fits ||
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
          <p className="text-muted-foreground text-xs">
            No home compute capacity is available. A node must be enrolled and
            given a reservation before CPU instances can run.
          </p>
        ) : (
          <Field label="Size" htmlFor="cpu-tier">
            <Select
              id="cpu-tier"
              value={tierId}
              onChange={(e) => setTierId(e.target.value)}
              disabled={homeCap.isLoading}
            >
              {tiers.map((t) => (
                <option key={t.id} value={t.id} disabled={!t.fits}>
                  {t.name} — {t.cpu_units} vCPU / {t.memory_gb} GB —{" "}
                  {formatMonthly(t.price_per_hour)}
                  {t.fits ? "" : " (no capacity)"}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {nothingFits && (
          <p className="text-muted-foreground text-xs">
            No home node currently has enough free capacity for any size. Try
            again once capacity frees up.
          </p>
        )}

        {selected?.fits && (
          <div className="hairline flex items-baseline justify-between rounded-md border-border bg-muted/50 px-3 py-2.5">
            <span className="text-muted-foreground text-xs">
              Billed while running
            </span>
            <span className="text-right">
              <span className="tabular text-foreground block text-sm font-medium">
                {formatMonthly(selected.price_per_hour)}
              </span>
              {/* The exact hourly rate metering charges — so the quote the
                  customer sees equals the bill, without sub-cent rounding. */}
              <span className="text-muted-foreground tabular block text-xs">
                {formatRate(selected.price_per_hour)}
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
