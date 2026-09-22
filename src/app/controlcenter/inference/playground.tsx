"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import type { InferenceModel } from "@/lib/api/types";

/**
 * Sends one prompt through the real gateway path (live mounted backend,
 * tunnel dispatch) so an operator can verify a mount works end to end.
 * The first request after mounting an MLX model loads the weights, which
 * can take minutes — the button stays busy until the backend answers.
 */
export function InferencePlayground({ models }: { models: InferenceModel[] }) {
  const routable = models.filter((m) => m.enabled);
  const [route, setRoute] = useState("");
  const [prompt, setPrompt] = useState("Say hello in one short sentence.");
  const [maxTokens, setMaxTokens] = useState("512");

  const selected = route || routable[0]?.model_route || "";

  const chat = useMutation({
    mutationFn: () =>
      admin.inferenceChat({
        model_route: selected,
        prompt,
        max_tokens: Number(maxTokens) || undefined,
      }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Try it</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {!routable.length ? (
          <p className="text-muted-foreground text-sm">
            Enable a model in the catalog above, and mount it on a node, to try
            it here.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Select
                value={selected}
                onChange={(e) => setRoute(e.target.value)}
              >
                {routable.map((m) => (
                  <option key={m.model_route} value={m.model_route}>
                    {m.model_route}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min="1"
                max="8192"
                className="tabular"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                aria-label="Max tokens"
              />
            </div>
            <textarea
              className="hairline border-border bg-background min-h-20 w-full rounded-md p-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div>
              <Button
                variant="primary"
                size="sm"
                disabled={chat.isPending || !prompt.trim() || !selected}
                onClick={() => chat.mutate()}
              >
                {chat.isPending ? "Waiting for the model…" : "Send"}
              </Button>
            </div>
            {chat.isError && (
              <p className="text-destructive text-sm">
                {errorMessage(chat.error)}
              </p>
            )}
            {chat.data && (
              <div className="hairline border-border rounded-md p-3 text-sm">
                {chat.data.content ? (
                  <div className="whitespace-pre-wrap">{chat.data.content}</div>
                ) : (
                  <div className="text-muted-foreground">
                    (No answer text was returned.
                    {chat.data.finish_reason === "length"
                      ? " The reply hit the max-tokens limit, likely while the model was still thinking — raise max tokens."
                      : ""}
                    )
                  </div>
                )}
                {chat.data.reasoning && (
                  <details className="mt-2">
                    <summary className="text-muted-foreground cursor-pointer text-xs">
                      Model thinking
                    </summary>
                    <div className="text-muted-foreground mt-1 text-xs whitespace-pre-wrap">
                      {chat.data.reasoning}
                    </div>
                  </details>
                )}
                <div className="text-muted-foreground tabular mt-2 text-xs">
                  {chat.data.model} · {chat.data.input_tokens} in /{" "}
                  {chat.data.output_tokens} out ·{" "}
                  {(chat.data.latency_ms / 1000).toFixed(1)}s
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
