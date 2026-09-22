"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
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
import { api } from "@/lib/api/client";
import {
  errorMessage,
  keys as queryKeys,
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from "@/lib/api/hooks";
import { fullTime, timeAgo } from "@/lib/utils";
import type { APIKey } from "@/lib/api/types";

/**
 * API keys, scoped to one project.
 *
 * A key authenticates the CLI / SDK / REST calls that create and manage this
 * project's resources. The full secret is shown ONCE, at creation — after
 * that only its prefix is ever displayed, because the server stores a hash,
 * not the key. Revoking is immediate and irreversible.
 *
 * Rows are selectable so several keys can be revoked at once — a fleet often
 * rotates a batch of CI keys together, and revoking them one dialog at a time
 * is tedious and error-prone.
 */
export function ApiKeysPanel({ projectId }: { projectId: string }) {
  const { data, isLoading, isError, error } = useApiKeys(projectId);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<APIKey | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRevoking, setBulkRevoking] = useState(false);

  const keys = data?.api_keys ?? [];

  // Selection can only ever reference keys that still exist — after a revoke
  // the list shrinks, so intersect rather than trusting stale ids.
  const selectedKeys = keys.filter((k) => selected.has(k.id));
  const allSelected = keys.length > 0 && selectedKeys.length === keys.length;
  const someSelected = selectedKeys.length > 0 && !allSelected;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(keys.map((k) => k.id)));

  return (
    <div className="flex max-w-3xl flex-col gap-6 p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>API keys</CardTitle>
          <div className="flex items-center gap-2">
            {selectedKeys.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkRevoking(true)}
              >
                Revoke {selectedKeys.length} selected
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreating(true)}
            >
              Create key
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <Loading className="py-16" />
          ) : isError ? (
            <div className="text-destructive p-6 text-sm">
              {errorMessage(error)}
            </div>
          ) : keys.length === 0 ? (
            <EmptyState
              title="No API keys"
              description="Create a key to authenticate the CLI, SDK, or REST calls that manage this project."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCreating(true)}
                >
                  Create key
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-9 pr-0">
                    <input
                      type="checkbox"
                      aria-label="Select all keys"
                      className="accent-foreground align-middle"
                      checked={allSelected}
                      ref={(el) => {
                        // Indeterminate is DOM-only state (no checked value),
                        // so it has to be set imperatively on the element.
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                    />
                  </TH>
                  <TH>Name</TH>
                  <TH>Key</TH>
                  <TH>Access</TH>
                  <TH>Last used</TH>
                  <TH>Created</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {keys.map((key) => (
                  <TR
                    key={key.id}
                    className={selected.has(key.id) ? "bg-muted/50" : undefined}
                  >
                    <TD className="w-9 pr-0">
                      <input
                        type="checkbox"
                        aria-label={`Select ${key.name}`}
                        className="accent-foreground align-middle"
                        checked={selected.has(key.id)}
                        onChange={() => toggle(key.id)}
                      />
                    </TD>
                    <TD className="text-foreground">{key.name}</TD>
                    <TD>
                      <span className="identifier text-muted-foreground">
                        {key.key_prefix}…
                      </span>
                    </TD>
                    <TD className="text-muted-foreground">
                      {describeAccess(key.scopes)}
                    </TD>
                    <TD className="text-muted-foreground">
                      {key.last_used_at ? (
                        <span title={fullTime(key.last_used_at)}>
                          {timeAgo(key.last_used_at)}
                        </span>
                      ) : (
                        "Never"
                      )}
                    </TD>
                    <TD className="text-muted-foreground">
                      <span title={fullTime(key.created_at)}>
                        {timeAgo(key.created_at)}
                      </span>
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setRevoking(key)}
                      >
                        Revoke
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {creating && (
        <CreateKeyDialog
          projectId={projectId}
          onClose={() => setCreating(false)}
        />
      )}
      {revoking && (
        <RevokeKeyDialog
          projectId={projectId}
          apiKey={revoking}
          onClose={() => setRevoking(null)}
        />
      )}
      {bulkRevoking && (
        <BulkRevokeDialog
          projectId={projectId}
          apiKeys={selectedKeys}
          onClose={(revoked) => {
            setBulkRevoking(false);
            // Drop the keys that were actually revoked from the selection so
            // the bar reflects what remains (a partial failure keeps the rest
            // selected for a retry).
            if (revoked.length > 0) {
              setSelected((prev) => {
                const next = new Set(prev);
                for (const id of revoked) next.delete(id);
                return next;
              });
            }
          }}
        />
      )}
    </div>
  );
}

function CreateKeyDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const create = useCreateApiKey(projectId);
  const [name, setName] = useState("");
  const [manage, setManage] = useState(true);
  const [inference, setInference] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  // Once created, the dialog becomes a one-time reveal — the full key is
  // returned only at creation and cannot be recovered, so the customer must
  // copy it now.
  if (secret) {
    return (
      <Dialog
        title="API key created"
        description="Copy this now — it is shown only once and cannot be recovered."
        onClose={onClose}
        footer={
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="flex items-center gap-2">
          <code className="bg-muted text-foreground block flex-1 rounded p-3 text-xs break-all">
            {secret}
          </code>
          <CopyButton value={secret} />
        </div>
      </Dialog>
    );
  }

  const valid = name.trim() !== "" && (manage || inference);

  return (
    <Dialog
      title="Create API key"
      description="Names it for you — the secret is generated on the server."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!valid || create.isPending}
            onClick={() =>
              create.mutate(
                { name: name.trim(), scopes: buildScopes(manage, inference) },
                { onSuccess: (data) => setSecret(data.key) },
              )
            }
          >
            {create.isPending ? "Creating…" : "Create key"}
          </Button>
        </>
      }
    >
      <Field
        label="Name"
        hint="How you'll recognise this key — e.g. ci-pipeline, laptop."
        error={create.isError ? errorMessage(create.error) : undefined}
        htmlFor="key-name"
      >
        <Input
          id="key-name"
          placeholder="ci-pipeline"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="text-muted-foreground mb-1 text-xs">
          Permissions
        </legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-foreground mt-0.5"
            checked={manage}
            onChange={(e) => setManage(e.target.checked)}
          />
          <span>
            Manage project resources
            <span className="text-muted-foreground block text-xs">
              Create and manage instances, storage and builds.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-foreground mt-0.5"
            checked={inference}
            onChange={(e) => setInference(e.target.checked)}
          />
          <span>
            Call Teepin Inference models
            <span className="text-muted-foreground block text-xs">
              Use the chat completions API. Billed per token.
            </span>
          </span>
        </label>
      </fieldset>
    </Dialog>
  );
}

function RevokeKeyDialog({
  projectId,
  apiKey,
  onClose,
}: {
  projectId: string;
  apiKey: APIKey;
  onClose: () => void;
}) {
  const revoke = useRevokeApiKey(projectId);
  return (
    <Dialog
      title="Revoke API key"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(apiKey.id, { onSuccess: onClose })}
          >
            {revoke.isPending ? "Revoking…" : "Revoke key"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Revoking <span className="text-foreground">{apiKey.name}</span> (
          <span className="identifier">{apiKey.key_prefix}…</span>) takes effect
          immediately. Any CLI, SDK, or service using it will start getting
          401s. This cannot be undone.
        </p>
        {revoke.isError && (
          <p className="text-destructive text-xs">
            {errorMessage(revoke.error)}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Revoke several keys at once.
 *
 * The API revokes one key per call, so this fans out to N parallel requests
 * and waits for all of them (allSettled — a slow or failing one must not
 * abandon the rest). It reports how many succeeded and, on a partial failure,
 * keeps the failed ones selected so the operator can retry. The query is
 * invalidated once, after the batch, rather than N times.
 */
function BulkRevokeDialog({
  projectId,
  apiKeys,
  onClose,
}: {
  projectId: string;
  apiKeys: APIKey[];
  onClose: (revoked: string[]) => void;
}) {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<number | null>(null);

  const run = async () => {
    setPending(true);
    setFailed(null);
    const results = await Promise.allSettled(
      apiKeys.map((k) => api.revokeApiKey(projectId, k.id).then(() => k.id)),
    );
    const revoked = results
      .filter(
        (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled",
      )
      .map((r) => r.value);
    const failures = results.length - revoked.length;

    // One invalidation for the whole batch, not one per key.
    await client.invalidateQueries({
      queryKey: queryKeys.apiKeys(projectId),
    });
    setPending(false);

    if (failures === 0) {
      onClose(revoked);
    } else {
      // Leave the dialog open showing what failed; caller drops the revoked
      // ones from the selection so a retry targets only the stragglers.
      setFailed(failures);
    }
  };

  return (
    <Dialog
      title={`Revoke ${apiKeys.length} API ${apiKeys.length === 1 ? "key" : "keys"}`}
      onClose={() => onClose([])}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onClose([])}>
            {failed === null ? "Cancel" : "Close"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={run}
          >
            {pending
              ? "Revoking…"
              : failed === null
                ? `Revoke ${apiKeys.length} ${apiKeys.length === 1 ? "key" : "keys"}`
                : "Retry failed"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          This immediately revokes the following{" "}
          {apiKeys.length === 1 ? "key" : `${apiKeys.length} keys`}. Anything
          using them will start getting 401s. This cannot be undone.
        </p>
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {apiKeys.map((k) => (
            <li key={k.id} className="text-foreground flex gap-2 text-sm">
              <span>{k.name}</span>
              <span className="identifier text-muted-foreground">
                {k.key_prefix}…
              </span>
            </li>
          ))}
        </ul>
        {failed !== null && (
          <p className="text-destructive text-xs">
            {failed} {failed === 1 ? "key" : "keys"} could not be revoked. The
            rest were revoked; retry the remaining.
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** Scopes a key is created with, from the two permission choices. */
function buildScopes(manage: boolean, inference: boolean): string[] {
  const scopes: string[] = [];
  if (manage) scopes.push("instances:read", "instances:write");
  if (inference) scopes.push("inference:invoke");
  return scopes;
}

/** Plain-language summary of what a key may do. */
function describeAccess(scopes: string[] | undefined): string {
  const list = scopes ?? [];
  const parts: string[] = [];
  if (list.some((s) => s.startsWith("instances:"))) parts.push("Resources");
  if (list.includes("inference:invoke")) parts.push("Inference");
  return parts.length ? parts.join(" + ") : "Resources";
}
