"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Loading } from "@/components/ui/loading";
import {
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api/client";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import type { InferenceModel } from "@/lib/api/types";
import { InferencePlayground } from "./playground";
import { RegisterModelDialog } from "./register-model-dialog";
import { SetPricingDialog } from "./set-pricing-dialog";
import {
  CostClassPill,
  EnabledPill,
  describeCapabilities,
  describeModelPricing,
} from "./inference-format";

/**
 * Teepin Inference's model catalog.
 *
 * One list for every model this platform can serve — self-hosted and
 * third-party alike — distinguished by cost class. Mounting a self-hosted
 * model onto a specific node happens from that node's own detail page
 * (controlcenter/nodes/[id]), not here: this page is the catalog, not the
 * placement.
 */
export default function ControlCenterInferencePage() {
  const queryClient = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [pricingFor, setPricingFor] = useState<InferenceModel | null>(null);

  const models = useQuery({
    queryKey: ["admin", "inference-models"],
    queryFn: admin.listInferenceModels,
    retry: false, // a 404 (older control plane) should not be retried
  });
  // `?? []`: a genuinely empty catalog serializes as `models: null` on
  // some server versions (a real bug found live 2026-09-18, fixed at the
  // root in pkg/modelcatalog — this guard is what makes the page not
  // depend on that fix having actually rolled out yet).
  const modelList = models.data?.models ?? [];

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "inference-models"] });

  const setEnabled = useMutation({
    mutationFn: ({ route, enabled }: { route: string; enabled: boolean }) =>
      admin.setInferenceModelEnabled(route, enabled),
    onSuccess: refresh,
    onError: (e) => alert(errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (route: string) => admin.deleteInferenceModel(route),
    onSuccess: refresh,
    onError: (e) => alert(errorMessage(e)),
  });

  const featureOff =
    models.error instanceof ApiError && models.error.status === 404;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Control centre", href: "/controlcenter" },
          "Inference",
        ]}
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Model catalog</CardTitle>
            {!featureOff && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowRegister(true)}
              >
                Register model
              </Button>
            )}
          </CardHeader>

          {featureOff ? (
            <div className="text-muted-foreground px-4 py-6 text-sm">
              Teepin Inference is not available on this control plane.
            </div>
          ) : models.isLoading ? (
            <Loading className="px-4 py-16" />
          ) : !modelList.length ? (
            <EmptyState
              title="No models registered"
              description="Register a model to make it routable, then set its pricing and mount it on a node."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Model route</TH>
                  <TH>Cost class</TH>
                  <TH>Engine</TH>
                  <TH>Capabilities</TH>
                  <TH>Pricing</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {modelList.map((model) => (
                  <TR key={model.model_route}>
                    <TD className="identifier font-medium">
                      {model.model_route}
                    </TD>
                    <TD>
                      <CostClassPill costClass={model.cost_class} />
                    </TD>
                    <TD className="text-muted-foreground">{model.engine}</TD>
                    <TD className="text-muted-foreground">
                      {describeCapabilities(model)}
                    </TD>
                    <TD className="tabular text-muted-foreground">
                      {describeModelPricing(model)}
                    </TD>
                    <TD>
                      <EnabledPill enabled={model.enabled} />
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPricingFor(model)}
                        >
                          Pricing
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={setEnabled.isPending}
                          onClick={() =>
                            setEnabled.mutate({
                              route: model.model_route,
                              enabled: !model.enabled,
                            })
                          }
                        >
                          {model.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={del.isPending}
                          onClick={() => {
                            if (
                              confirm(
                                `Delete "${model.model_route}" from the catalog? This does not unmount it from any node.`,
                              )
                            ) {
                              del.mutate(model.model_route);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        {!featureOff && <InferencePlayground models={modelList} />}
      </div>

      {showRegister && (
        <RegisterModelDialog onClose={() => setShowRegister(false)} />
      )}
      {pricingFor && (
        <SetPricingDialog
          model={pricingFor}
          onClose={() => setPricingFor(null)}
        />
      )}
    </>
  );
}
