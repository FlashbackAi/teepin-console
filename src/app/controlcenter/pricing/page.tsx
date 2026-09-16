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
  const [pCoreRate, setPCoreRate] = useState("");
  const [eCoreRate, setECoreRate] = useState("");
  const [storageRate, setStorageRate] = useState("");
  const [llmInRate, setLlmInRate] = useState("");
  const [llmOutRate, setLlmOutRate] = useState("");

  useEffect(() => {
    if (pricing.data) {
      setRate(String(pricing.data.vram_price_per_gb_hour));
      setCpuRate(String(pricing.data.cpu_price_per_core_hour ?? 0));
      setMemRate(String(pricing.data.memory_price_per_gb_hour ?? 0));
      setPCoreRate(String(pricing.data.p_core_price_per_hour ?? 0));
      setECoreRate(String(pricing.data.e_core_price_per_hour ?? 0));
      setStorageRate(String(pricing.data.storage_price_per_gb_month ?? 0));
      setLlmInRate(String(pricing.data.llm_price_per_million_input ?? 0));
      setLlmOutRate(String(pricing.data.llm_price_per_million_output ?? 0));
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

  const updatePECore = useMutation({
    mutationFn: () =>
      admin.updatePECorePricing({
        p_core_price_per_hour: Number(pCoreRate),
        e_core_price_per_hour: Number(eCoreRate),
      }),
    onSuccess: (data) => queryClient.setQueryData(["admin", "pricing"], data),
  });

  const updateStorage = useMutation({
    mutationFn: () => admin.updateStoragePricing(Number(storageRate)),
    onSuccess: (data) => queryClient.setQueryData(["admin", "pricing"], data),
  });

  const updateLLM = useMutation({
    mutationFn: () =>
      admin.updateLLMPricing({
        llm_price_per_million_input: Number(llmInRate),
        llm_price_per_million_output: Number(llmOutRate),
      }),
    onSuccess: (data) => queryClient.setQueryData(["admin", "pricing"], data),
  });

  const current = pricing.data?.vram_price_per_gb_hour;
  const dirty = rate !== "" && Number(rate) !== current;
  const cpuDirty =
    (cpuRate !== "" &&
      Number(cpuRate) !== pricing.data?.cpu_price_per_core_hour) ||
    (memRate !== "" &&
      Number(memRate) !== pricing.data?.memory_price_per_gb_hour);
  const pECoreDirty =
    (pCoreRate !== "" &&
      Number(pCoreRate) !== pricing.data?.p_core_price_per_hour) ||
    (eCoreRate !== "" &&
      Number(eCoreRate) !== pricing.data?.e_core_price_per_hour);
  const storageDirty =
    storageRate !== "" &&
    Number(storageRate) !== pricing.data?.storage_price_per_gb_month;
  const llmDirty =
    (llmInRate !== "" &&
      Number(llmInRate) !== pricing.data?.llm_price_per_million_input) ||
    (llmOutRate !== "" &&
      Number(llmOutRate) !== pricing.data?.llm_price_per_million_output);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Control centre", href: "/controlcenter" }, "Pricing"]}
      />

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
            <CardTitle>P-core / E-core rates</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                updatePECore.mutate();
              }}
              className="flex flex-col gap-4"
            >
              <Field
                label="Price per P-core-hour (USD)"
                hint="Applies only to a home-node instance placed with a detected P-core/E-core split. 0 = do not charge."
                htmlFor="p-core-rate"
              >
                <Input
                  id="p-core-rate"
                  type="number"
                  step="0.0001"
                  min="0"
                  required
                  className="tabular"
                  value={pCoreRate}
                  onChange={(e) => setPCoreRate(e.target.value)}
                />
              </Field>
              <Field
                label="Price per E-core-hour (USD)"
                hint="0 = do not charge."
                error={updatePECore.isError ? errorMessage(updatePECore.error) : undefined}
                htmlFor="e-core-rate"
              >
                <Input
                  id="e-core-rate"
                  type="number"
                  step="0.0001"
                  min="0"
                  required
                  className="tabular"
                  value={eCoreRate}
                  onChange={(e) => setECoreRate(e.target.value)}
                />
              </Field>

              {/* The rate that actually applies without a detected split is
                  the CPU card above — stated here so the two cards are
                  never mistaken for alternatives. */}
              <p className="text-muted-foreground text-xs">
                A home-node instance with no detected P/E split still bills
                off the CPU rate above, unchanged. These rates apply only
                once a split is detected. Applies to the next billing tick;
                existing usage keeps its metered rate.
              </p>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!pECoreDirty || updatePECore.isPending}
                >
                  {updatePECore.isPending ? "Saving…" : "Update P/E-core rates"}
                </Button>
                {updatePECore.isSuccess && !pECoreDirty && (
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

        <Card>
          <CardHeader>
            <CardTitle>Kumbha (AI build agent) rate</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                updateLLM.mutate();
              }}
              className="flex flex-col gap-4"
            >
              <Field
                label="Price per million input tokens (USD)"
                hint="0 = do not charge."
                htmlFor="llm-in-rate"
              >
                <Input
                  id="llm-in-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="tabular"
                  value={llmInRate}
                  onChange={(e) => setLlmInRate(e.target.value)}
                />
              </Field>
              <Field
                label="Price per million output tokens (USD)"
                hint="0 = do not charge."
                error={updateLLM.isError ? errorMessage(updateLLM.error) : undefined}
                htmlFor="llm-out-rate"
              >
                <Input
                  id="llm-out-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="tabular"
                  value={llmOutRate}
                  onChange={(e) => setLlmOutRate(e.target.value)}
                />
              </Field>

              {/* This is the one rate a customer directly watches move in
                  real time (the build page's own budget meter), so the
                  "does this rewrite history" note matters here as much as
                  anywhere else on this page. */}
              <p className="text-muted-foreground text-xs">
                Every Kumbha build session is metered but bills nothing
                until non-zero rates are set here. Applies to the next
                completion; usage already accrued keeps the rate it was
                metered at.
              </p>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!llmDirty || updateLLM.isPending}
                >
                  {updateLLM.isPending ? "Saving…" : "Update Kumbha rates"}
                </Button>
                {updateLLM.isSuccess && !llmDirty && (
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
