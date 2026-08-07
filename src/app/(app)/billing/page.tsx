"use client";

import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle, Stat } from "@/components/ui/card";
import {
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/table";
import { errorMessage, useBillingSummary } from "@/lib/api/hooks";
import { formatCost } from "@/lib/utils";

export default function BillingPage() {
  const billing = useBillingSummary();
  const data = billing.data;

  const period = data
    ? `${new Date(data.period_start).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })}`
    : "";

  return (
    <>
      <PageHeader breadcrumb={["Billing"]} />

      <div className="flex flex-col gap-6 p-6">
        {billing.isError && (
          <Card className="px-4 py-3">
            <p className="text-muted-foreground text-sm">
              {errorMessage(billing.error)}
            </p>
          </Card>
        )}

        <section className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <Stat
            label="Month to date"
            value={data ? formatCost(data.total_cost) : "—"}
            hint={period}
          />
          <Stat
            label="Projects billed"
            value={data ? String(data.projects.length) : "—"}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Usage by project</CardTitle>
          </CardHeader>

          {billing.isLoading ? (
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              Loading…
            </div>
          ) : !data?.projects.length ? (
            <EmptyState
              title="No usage yet"
              description="GPU time is metered hourly. Costs appear here within an hour of an instance running."
            />
          ) : (
            <CardContent className="flex flex-col gap-6">
              {data.projects.map((project) => (
                <div key={project.project_id}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-foreground text-sm font-medium">
                      {project.project_name}
                    </span>
                    <span className="tabular text-foreground text-sm">
                      {formatCost(project.cost)}
                    </span>
                  </div>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Service</TH>
                        <TH className="text-right">Quantity</TH>
                        <TH className="text-right">Instances</TH>
                        <TH className="text-right">Cost</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {project.services.map((service) => (
                        <TR key={service.service}>
                          <TD>{service.service}</TD>
                          <TD className="tabular text-muted-foreground text-right">
                            {service.quantity.toFixed(4)} {service.unit}
                          </TD>
                          <TD className="tabular text-muted-foreground text-right">
                            {service.instances}
                          </TD>
                          <TD className="tabular text-right">
                            {formatCost(service.cost)}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      </div>
    </>
  );
}
