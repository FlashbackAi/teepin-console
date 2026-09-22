"use client";

import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
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
import { useActiveProject } from "@/lib/active-project";
import { API_BASE_URL } from "@/lib/api/client";
import { errorMessage, useInferenceModels } from "@/lib/api/hooks";
import type { PublicModel } from "@/lib/api/types";

/**
 * Teepin Inference for customers: one OpenAI-compatible base URL for every
 * model, the model chosen per request, and an API key carrying the
 * "Call Teepin Inference models" permission. This page shows what is
 * available, what it costs, and how to call it.
 */
export default function InferencePage() {
  const { project } = useActiveProject();
  const models = useInferenceModels();
  const list = models.data?.data ?? [];
  const firstModel = list[0]?.id ?? "teepin/your-model";
  const baseUrl = `${API_BASE_URL}/v1`;

  const curl = `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer $TEEPIN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${firstModel}",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`;

  const python = `from openai import OpenAI

client = OpenAI(base_url="${baseUrl}", api_key="<your Teepin API key>")

response = client.chat.completions.create(
    model="${firstModel}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Projects", href: "/projects" },
          project ? { label: project.name, href: "/home" } : "…",
          "Inference",
        ]}
      />

      <div className="flex max-w-4xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Endpoint</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-2">
              <code className="bg-muted text-foreground flex-1 rounded p-2.5 text-xs break-all">
                {baseUrl}
              </code>
              <CopyButton value={baseUrl} />
            </div>
            <p className="text-muted-foreground">
              One base URL for every model — choose the model in each request.
              It speaks the OpenAI chat completions format, so existing OpenAI
              client libraries work by changing the base URL and key.
            </p>
            <p className="text-muted-foreground">
              Authenticate with a project API key that has the{" "}
              <strong className="text-foreground">
                Call Teepin Inference models
              </strong>{" "}
              permission.{" "}
              {project ? (
                <Link
                  href={`/projects/${project.id}/settings`}
                  className="text-foreground underline"
                >
                  Create one in project settings
                </Link>
              ) : (
                "Create one in project settings"
              )}
              .
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Models</CardTitle>
          </CardHeader>
          {models.isLoading ? (
            <Loading className="px-4 py-10" />
          ) : models.isError ? (
            <div className="text-muted-foreground px-4 py-6 text-sm">
              {errorMessage(models.error)}
            </div>
          ) : !list.length ? (
            <EmptyState
              title="No models available yet"
              description="Models appear here once they are enabled."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Model</TH>
                  <TH>Context</TH>
                  <TH>Input / 1M tokens</TH>
                  <TH>Output / 1M tokens</TH>
                </TR>
              </THead>
              <TBody>
                {list.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="identifier text-foreground">
                          {m.id}
                        </span>
                        <CopyButton value={m.id} />
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {m.display_name}
                        {capabilityLabel(m) ? ` · ${capabilityLabel(m)}` : ""}
                      </div>
                    </TD>
                    <TD className="tabular text-muted-foreground">
                      {m.context_window
                        ? `${m.context_window.toLocaleString()} tokens`
                        : "—"}
                    </TD>
                    <TD className="tabular text-muted-foreground">
                      {formatRate(m.pricing.input_per_million_tokens)}
                    </TD>
                    <TD className="tabular text-muted-foreground">
                      {formatRate(m.pricing.output_per_million_tokens)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Call it</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Snippet label="curl" code={curl} />
            <Snippet label="Python (OpenAI SDK)" code={python} />
            <p className="text-muted-foreground text-xs">
              Add <code>&quot;stream&quot;: true</code> to receive the reply as
              it is generated. You are billed per input and output token at the
              rates above.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Snippet({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-muted-foreground text-xs">{label}</span>
        <CopyButton value={code} />
      </div>
      <pre className="bg-muted text-foreground overflow-x-auto rounded p-3 text-xs">
        {code}
      </pre>
    </div>
  );
}

function capabilityLabel(m: PublicModel): string {
  const caps: string[] = [];
  if (m.supports_tools) caps.push("tools");
  if (m.supports_vision) caps.push("vision");
  if (m.supports_audio) caps.push("audio");
  return caps.join(", ");
}

/** Price per million tokens; 0 means no rate has been set, not "free". */
function formatRate(perMillion: number): string {
  return perMillion > 0 ? `$${perMillion.toFixed(2)}` : "Not set";
}
