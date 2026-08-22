"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";

/**
 * Platform pricing.
 *
 * One rate drives every GPU quote and every billing tick. Changing it
 * applies to the NEXT allocation immediately; usage already metered
 * keeps the rate it was metered at, so past invoices never move.
 */
export default function ControlCenterPricingPage() {
  const queryClient = useQueryClient();

  const pricing = useQuery({
    queryKey: ["admin", "pricing"],
    queryFn: admin.getPricing,
  });

  const [rate, setRate] = useState("");
  const [cpuRate, setCpuRate] = useState("");
  const [memRate, setMemRate] = useState("");
  const [storageRate, setStorageRate] = useState("");

  useEffect(() => {
    if (pricing.data) {
      setRate(String(pricing.data.vram_price_per_gb_hour));
      setCpuRate(String(pricing.data.cpu_price_per_core_hour ?? 0));
      setMemRate(String(pricing.data.memory_price_per_gb_hour ?? 0));
      setStorageRate(String(pricing.data.storage_price_per_gb_month ?? 0));
    }
  }, [pricing.data]);

  const update = useMutation({
    mutationFn: (value: number) => admin.updatePricing(value),
    onSuccess: (data) => queryClient.setQueryData(["admin", "pricing"], data),
  });

  const updateCPU = useMutation({
    mutationFn: () =>
      admin.updateCPUPricing({
        cpu_price_per_core_hour: Number(cpuRate),
        memory_price_per_gb_hour: Number(memRate),
      }),
    onSuccess: (data) => queryClient.setQueryData(["admin", "pricing"], data),
  });

  const updateStorage = useMutation({
    mutationFn: () => admin.updateStoragePricing(Number(storageRate)),
    onSuccess: (data) => queryClient.setQueryData(["admin", "pricing"], data),
  });

  const current = pricing.data?.vram_price_per_gb_hour;
  const dirty = rate !== "" && Number(rate) !== current;
  const cpuDirty =
    (cpuRate !== "" &&
      Number(cpuRate) !== pricing.data?.cpu_price_per_core_hour) ||
    (memRate !== "" &&
      Number(memRate) !== pricing.data?.memory_price_per_gb_hour);
  const storageDirty =
    storageRate !== "" &&
    Number(storageRate) !== pricing.data?.storage_price_per_gb_month;

  return (
    <>
      <PageHeader breadcrumb={["Control centre", "Pricing"]} />

      <div className="flex max-w-xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>GPU VRAM rate</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                update.mutate(Number(rate));
              }}
              className="flex flex-col gap-4"
            >
              <Field
                label="Price per GB-hour (USD)"
                hint="A 10GB instance at $0.10/GB-hour bills $1.00/hour."
                error={update.isError ? errorMessage(update.error) : undefined}
                htmlFor="rate"
              >
                <Input
                  id="rate"
                  type="number"
                  step="0.001"
                  min="0"
                  required
                  className="tabular"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </Field>

              {/* Stated because it is the question anyone changing a
                  price actually has: does this rewrite history? */}
              <p className="text-muted-foreground text-xs">
                Applies to the next allocation and billing tick. Usage
                already metered keeps the rate it was metered at, so
                existing invoices do not change.
              </p>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!dirty || update.isPending}
                >
                  {update.isPending ? "Saving…" : "Update rate"}
                </Button>
                {update.isSuccess && !dirty && (
                  <span className="text-muted-foreground text-xs">Saved.</span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Home compute (CPU) rate</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                updateCPU.mutate();
              }}
              className="flex flex-col gap-4"
            >
              <Field
                label="Price per vCPU-hour (USD)"
                hint="Akash reference: ~$0.0022/hr. 0 = do not charge."
                htmlFor="cpu-rate"
              >
                <Input
                  id="cpu-rate"
                  type="number"
                  step="0.0001"
                  min="0"
                  required
                  className="tabular"
                  value={cpuRate}
                  onChange={(e) => setCpuRate(e.target.value)}
                />
              </Field>
              <Field
                label="Price per GB-hour of memory (USD)"
                hint="Akash reference: ~$0.0011/hr. 0 = do not charge."
                error={updateCPU.isError ? errorMessage(updateCPU.error) : undefined}
                htmlFor="mem-rate"
              >
                <Input
                  id="mem-rate"
                  type="number"
                  step="0.0001"
                  min="0"
                  required
                  className="tabular"
                  value={memRate}
                  onChange={(e) => setMemRate(e.target.value)}
                />
              </Field>

              {/* The safety note: shipping at 0 means home CPU is metered but
                  not charged until someone deliberately sets a rate. */}
              <p className="text-muted-foreground text-xs">
                Home CPU instances are metered continuously but bill nothing
                until a non-zero rate is set. Applies to the next billing tick;
                existing usage keeps its metered rate.
              </p>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!cpuDirty || updateCPU.isPending}
                >
                  {updateCPU.isPending ? "Saving…" : "Update CPU rates"}
                </Button>
                {updateCPU.isSuccess && !cpuDirty && (
                  <span className="text-muted-foreground text-xs">Saved.</span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Persistent storage rate</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                updateStorage.mutate();
              }}
              className="flex flex-col gap-4"
            >
              <Field
                label="Price per GB-month (USD)"
                hint="Billed on the same hourly tick as everything else, converted from the monthly rate. 0 = do not charge."
                error={updateStorage.isError ? errorMessage(updateStorage.error) : undefined}
                htmlFor="storage-rate"
              >
                <Input
                  id="storage-rate"
                  type="number"
                  step="0.0001"
                  min="0"
                  required
                  className="tabular"
                  value={storageRate}
                  onChange={(e) => setStorageRate(e.target.value)}
                />
              </Field>

              <p className="text-muted-foreground text-xs">
                Persistent volumes are metered continuously but bill nothing
                until a non-zero rate is set. Applies to the next billing
                tick; existing usage keeps its metered rate.
              </p>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!storageDirty || updateStorage.isPending}
                >
                  {updateStorage.isPending ? "Saving…" : "Update storage rate"}
                </Button>
                {updateStorage.isSuccess && !storageDirty && (
                  <span className="text-muted-foreground text-xs">Saved.</span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
