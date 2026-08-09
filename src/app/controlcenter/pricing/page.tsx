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

  useEffect(() => {
    if (pricing.data) {
      setRate(String(pricing.data.vram_price_per_gb_hour));
    }
  }, [pricing.data]);

  const update = useMutation({
    mutationFn: (value: number) => admin.updatePricing(value),
    onSuccess: (data) => queryClient.setQueryData(["admin", "pricing"], data),
  });

  const current = pricing.data?.vram_price_per_gb_hour;
  const dirty = rate !== "" && Number(rate) !== current;

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
      </div>
    </>
  );
}
