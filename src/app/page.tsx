"use client";

import { Sidebar } from "@/components/shell/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Stat } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status";
import {
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/table";
import { formatCost, formatRate } from "@/lib/utils";
import type { Instance } from "@/lib/api/types";

/**
 * Design system preview.
 *
 * Temporary: this is the Stage B deliverable — every component rendered
 * together so the visual direction can be judged before screens are
 * built on top of it. Replaced by the real dashboard in Stage C.
 */

const SAMPLE: Instance[] = [
  {
    id: "inst-74243967",
    name: "migtest",
    image: "nvidia/cuda:12.3.1-base-ubuntu22.04",
    status: "running",
    instance_type: "gpu.a100.1g.10gb",
    price_per_hour: 1,
    gpu_vram: "10GB",
    allocated_vram: "10GB",
    cpu_units: 2,
    memory: "8GB",
    created_at: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "inst-8ba21f04",
    name: "llama-inference",
    image: "registry.teepin.com/acme/llama2:v1",
    status: "pending",
    instance_type: "gpu.a100.1g.10gb",
    price_per_hour: 1,
    gpu_vram: "10GB",
    allocated_vram: "10GB",
    cpu_units: 4,
    memory: "16GB",
    created_at: new Date(Date.now() - 1000 * 42).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "inst-3f9c1d22",
    name: "trainer",
    image: "acme/trainer:latest",
    status: "failed",
    status_message: "manifest unknown",
    instance_type: "gpu.a100.1g.10gb",
    price_per_hour: 1,
    cpu_units: 8,
    memory: "32GB",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export default function Preview() {
  return (
    <div className="flex">
      <Sidebar
        accountName="Flashback Tech"
        accountNumber="4815162342"
        projectName="production"
        instanceCount={3}
        monthToDate="$0.59"
      />

      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="hairline-b flex h-12 items-center justify-between border-border px-6">
          <div className="text-muted-foreground text-sm">
            Projects <span className="text-muted-foreground/50">/</span>{" "}
            production <span className="text-muted-foreground/50">/</span>{" "}
            <span className="text-foreground">GPU compute</span>
          </div>
          <Button variant="primary" size="sm">
            Create instance
          </Button>
        </header>

        <div className="flex flex-col gap-6 p-6">
          <section className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            <Stat label="Running instances" value="1" />
            <Stat label="Month to date" value={formatCost(0.5892)} />
            <Stat label="GPU hours" value="0.22" hint="this month" />
            <Stat label="Current rate" value={formatRate(1)} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Instances</CardTitle>
            </CardHeader>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>ID</TH>
                  <TH>Status</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Rate</TH>
                </TR>
              </THead>
              <TBody>
                {SAMPLE.map((instance) => (
                  <TR key={instance.id}>
                    <TD className="font-medium">{instance.name}</TD>
                    <TD>
                      <span className="identifier text-muted-foreground">
                        {instance.id}
                      </span>
                    </TD>
                    <TD>
                      <StatusPill
                        status={instance.status}
                        message={instance.status_message}
                      />
                    </TD>
                    <TD className="text-muted-foreground">
                      {instance.instance_type}
                    </TD>
                    <TD className="tabular text-right">
                      {formatRate(instance.price_per_hour ?? 0)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Form controls</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Field
                  label="Instance name"
                  hint="Lowercase letters, numbers and hyphens."
                  htmlFor="name"
                >
                  <Input id="name" placeholder="my-instance" />
                </Field>
                <Field
                  label="GPU memory"
                  hint="Billed per GB-hour at the current rate."
                  htmlFor="vram"
                >
                  <Select id="vram">
                    <option>10GB — $1.00/hr</option>
                    <option>20GB — $2.00/hr</option>
                    <option>40GB — $4.00/hr</option>
                  </Select>
                </Field>
                <Field
                  label="Container image"
                  error="Image tag not found in registry."
                  htmlFor="image"
                >
                  <Input id="image" defaultValue="acme/trainer:latest" />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Buttons</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Delete</Button>
                <Button variant="secondary" disabled>
                  Disabled
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <EmptyState
              title="No API keys"
              description="Create a key to deploy from the CLI or your CI pipeline."
              action={
                <Button variant="primary" size="sm">
                  Create API key
                </Button>
              }
            />
          </Card>
        </div>
      </main>
    </div>
  );
}
