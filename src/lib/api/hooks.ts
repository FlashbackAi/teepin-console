"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api, ApiError, tokens } from "./client";
import type {
  ConvertToOrganizationRequest,
  CreateInstanceRequest,
  Instance,
  KumbhaSkippedFile,
  KumbhaWorkspaceFile,
  UpdateAccountRequest,
  UpdateProjectRequest,
} from "./types";

// Deliberately not re-exported through `keys` below: a Kumbha session's
// query key is parameterised by id the same way `keys.instance(id)` is,
// but nothing outside this file's own Kumbha hooks needs to invalidate it
// by name, so it stays local rather than growing the shared namespace for
// no caller.
function kumbhaSessionKey(id: string) {
  return ["kumbha-session", id] as const;
}

function kumbhaSessionInstancesKey(id: string) {
  return ["kumbha-session-instances", id] as const;
}

/**
 * React Query hooks over the API client.
 *
 * Query keys are namespaced by resource so a mutation can invalidate
 * exactly what it changed — creating an instance should refresh the
 * instance list without re-fetching billing.
 */

export const keys = {
  account: ["account"] as const,
  accountUsers: ["account-users"] as const,
  projects: ["projects"] as const,
  apiKeys: (projectId: string) => ["api-keys", projectId] as const,
  instances: ["instances"] as const,
  instance: (id: string) => ["instance", id] as const,
  instanceMetrics: (id: string, since: string) => ["instance-metrics", id, since] as const,
  instanceTypes: ["instance-types"] as const,
  billing: ["billing"] as const,
  invoices: ["invoices"] as const,
  invoice: (id: string) => ["invoice", id] as const,
  paymentMethods: ["payment-methods"] as const,
  creditBalance: ["credit-balance"] as const,
  kumbhaSessions: ["kumbha-sessions"] as const,
};

// ---------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------

export function useAccount() {
  return useQuery({
    queryKey: keys.account,
    queryFn: api.currentAccount,
  });
}

export function useUpdateAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAccountRequest) => api.updateAccount(body),
    onSuccess: (account) => {
      // Write the response straight into the cache rather than
      // invalidating: the sidebar shows the account name, and a refetch
      // round trip makes a save look slower than it was.
      client.setQueryData(keys.account, account);
    },
  });
}

export function useConvertToOrganization() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ConvertToOrganizationRequest) =>
      api.convertToOrganization(body),
    onSuccess: (account) => client.setQueryData(keys.account, account),
  });
}

export function useAccountUsers() {
  return useQuery({
    queryKey: keys.accountUsers,
    queryFn: api.listAccountUsers,
  });
}

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: api.listProjects,
  });
}

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      api.createProject(body),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useUpdateProject(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProjectRequest) =>
      api.updateProject(projectId, body),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useDeleteProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api.deleteProject(projectId),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useApiKeys(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.apiKeys(projectId ?? ""),
    queryFn: () => api.listApiKeys(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useCreateApiKey(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => api.createApiKey(projectId, body),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: keys.apiKeys(projectId) }),
  });
}

export function useRevokeApiKey(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => api.revokeApiKey(projectId, keyId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: keys.apiKeys(projectId) }),
  });
}

// ---------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------

/**
 * Poll while anything is still settling.
 *
 * An instance that is `pending` will change on its own — the image is
 * pulling, or the command has not yet reached the agent. A customer
 * watching a create expects the page to keep up without pressing
 * refresh. Once everything is at rest, polling stops: there is no reason
 * to keep hitting the API for a list of terminated instances.
 */
function pollWhileSettling(instances: Instance[] | undefined) {
  if (!instances) return false as const;
  const settling = instances.some((i) => i.status === "pending");
  return settling ? 3_000 : false;
}

/**
 * @param enabled false until the project's API key exists.
 *
 * Compute endpoints authenticate with a project API key, which the
 * console provisions on demand. Querying before it exists sends a
 * request with no credentials and shows the customer an authentication
 * error for something they did nothing wrong in.
 */
export function useInstances(enabled = true) {
  return useQuery({
    queryKey: keys.instances,
    queryFn: api.listInstances,
    enabled,
    refetchInterval: (query) =>
      pollWhileSettling(query.state.data?.instances),
  });
}

export function useInstance(id: string, enabled = true) {
  return useQuery({
    queryKey: keys.instance(id),
    queryFn: () => api.getInstance(id),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 3_000 : false,
  });
}

export function useInstanceMetrics(id: string, since: string, enabled = true) {
  return useQuery({
    queryKey: keys.instanceMetrics(id, since),
    queryFn: () => api.getInstanceMetrics(id, since),
    enabled,
    refetchInterval: 30_000, // matches the agent's own ~30s report cadence
  });
}

export function useInstanceTypes(enabled = true) {
  return useQuery({
    queryKey: keys.instanceTypes,
    queryFn: api.listInstanceTypes,
    enabled,
    // Capacity changes as instances come and go, but not so fast that a
    // price quote goes stale within a form session.
    staleTime: 60_000,
  });
}

/** Home CPU capacity: which tiers fit right now. Returns undefined data on a
 *  404 (home compute disabled), so callers just see "no home capacity" rather
 *  than an error. Not retried — a 404 is a stable answer. */
export function useHomeCapacity(enabled = true) {
  return useQuery({
    queryKey: ["home-capacity"],
    queryFn: api.homeCapacity,
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}

/** Ports the given image declares via EXPOSE, for defaulting the
 *  create-instance form's Port field. `image` empty disables the query —
 *  callers should also debounce changes themselves so this does not fire
 *  on every keystroke. */
export function useImagePorts(image: string) {
  return useQuery({
    queryKey: ["image-ports", image],
    queryFn: () => api.imagePorts(image),
    enabled: image.trim().length > 0,
    // An image reference is immutable once published (or, for a moving
    // tag like :latest, changes rarely enough that re-fetching on every
    // render would be wasteful) — cache for the session.
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useCreateInstance() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInstanceRequest) => api.createInstance(body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.instances });
      // Capacity just changed; the next quote should reflect it.
      client.invalidateQueries({ queryKey: keys.instanceTypes });
    },
  });
}

export function useDeleteInstance() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteInstance(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.instances });
      client.invalidateQueries({ queryKey: keys.instanceTypes });
    },
  });
}

export function useInstanceLogs(
  id: string,
  enabled = true,
  tail = 200,
  timestamps = false,
) {
  return useQuery({
    queryKey: ["logs", id, tail, timestamps],
    queryFn: () => api.getInstanceLogs(id, tail, timestamps),
    enabled,
    // Logs are a live view while the customer is looking at them. React
    // Query already skips fetching (and thus polling) entirely while
    // `enabled` is false, so this stays a flat interval rather than
    // duplicating that condition here.
    refetchInterval: 5_000,
  });
}

// ---------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------

export function useBillingSummary() {
  return useQuery({
    queryKey: keys.billing,
    queryFn: api.billingSummary,
    // The collector aggregates hourly, so polling faster than that only
    // produces load without producing new numbers.
    staleTime: 60_000,
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: keys.invoices,
    queryFn: api.listInvoices,
    staleTime: 60_000,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: keys.invoice(id),
    queryFn: () => api.getInvoice(id),
    enabled: Boolean(id),
  });
}

// ---------------------------------------------------------------------
// Payment methods & credits
// ---------------------------------------------------------------------

export function usePaymentMethods() {
  return useQuery({
    queryKey: keys.paymentMethods,
    queryFn: api.listPaymentMethods,
    // The Stripe webhook that flips a card from pending to verified runs
    // asynchronously, well after confirmSetup() returns — so the
    // invalidateQueries() the add-card dialog fires on success almost
    // always refetches a still-pending row. Poll while anything hasn't
    // settled yet, same pattern as useInstances' pollWhileSettling, so a
    // newly added card flips to Verified on its own instead of the
    // customer needing to manually refresh the page.
    refetchInterval: (query) =>
      query.state.data?.payment_methods.some((m) => m.status === "pending")
        ? 3_000
        : false,
  });
}

export function useCreditBalance() {
  return useQuery({
    queryKey: keys.creditBalance,
    queryFn: api.creditBalance,
    staleTime: 60_000,
  });
}

export function useRemovePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removePaymentMethod(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: keys.paymentMethods }),
  });
}

export function useSetDefaultPaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.setDefaultPaymentMethod(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: keys.paymentMethods }),
  });
}

/**
 * Whether the account may launch resources: it has at least one verified
 * card. Derived from the payment-methods query so the compute create
 * dialog can pre-check without a separate endpoint. Returns undefined
 * while loading, so callers can tell "no card" from "not yet known".
 */
export function useCanProvision(): boolean | undefined {
  const methods = usePaymentMethods();
  if (methods.isLoading || !methods.data) return undefined;
  return methods.data.payment_methods.some((m) => m.status === "verified");
}

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------

export function useLogin() {
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const result = await api.login(body);
      tokens.set(result.access_token, result.refresh_token);
      return result;
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: {
      type: "personal" | "organization";
      display_name: string;
      email: string;
      password: string;
    }) => api.register(body),
  });
}

// ---------------------------------------------------------------------
// Kumbha
// ---------------------------------------------------------------------

/** Pre-authorises a session and (when a prompt is given) starts the agent
 *  in the same call — see api.createKumbhaSession. */
export function useCreateKumbhaSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { budget: number; label?: string; prompt?: string }) =>
      api.createKumbhaSession(body),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.kumbhaSessions }),
  });
}

/** The active project's Kumbha build history, most recent first — the
 *  Kumbha tab's landing view once any session exists. Read-only: for
 *  finding and revisiting a past build, not resuming its conversation. */
export function useKumbhaSessions(enabled = true) {
  return useQuery({
    queryKey: keys.kumbhaSessions,
    queryFn: api.listKumbhaSessions,
    enabled,
  });
}

/** Bulk-removes sessions from the "Previous builds" list — see
 *  api.deleteKumbhaSessions for the best-effort (not all-or-nothing)
 *  contract. */
export function useDeleteKumbhaSessions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.deleteKumbhaSessions(ids),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.kumbhaSessions }),
  });
}

/** Polls while a session is open — spend and deploy_approved both change
 *  on their own as the agent works, and the customer watching the build
 *  page expects the budget meter and plan modal to keep up without a
 *  manual refresh. Stops the instant the session reaches any terminal
 *  status, the same "settle then stop" shape as useInstances. */
export function useKumbhaSession(id: string, enabled = true) {
  return useQuery({
    queryKey: kumbhaSessionKey(id),
    queryFn: () => api.getKumbhaSession(id),
    enabled: enabled && Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.status === "open" ? 3_000 : false,
  });
}

/** Every instance this session has created, deploy-tracked or not — see
 *  api.listKumbhaSessionInstances and KumbhaSessionInstance's own doc
 *  comment for the incident this exists to make visible. Polled at the
 *  same cadence as the session itself while open: a deploy in progress
 *  can add a new row (a create_instance fallback, a redeploy) that the
 *  customer should see without a manual refresh. */
export function useKumbhaSessionInstances(id: string, enabled = true) {
  return useQuery({
    queryKey: kumbhaSessionInstancesKey(id),
    queryFn: () => api.listKumbhaSessionInstances(id),
    enabled: enabled && Boolean(id),
    refetchInterval: 3_000,
  });
}

export function useApproveKumbhaDeploy(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.approveKumbhaDeploy(id),
    onSuccess: (session) => client.setQueryData(kumbhaSessionKey(id), session),
  });
}

/** The live budget meter's "raise budget" control — see client.ts's
 *  updateKumbhaBudget doc comment. */
export function useIncreaseKumbhaBudget(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (budget: number) => api.updateKumbhaBudget(id, budget),
    onSuccess: (session) => client.setQueryData(kumbhaSessionKey(id), session),
  });
}

/** The console's chat input — "chat + resume". See client.ts's
 *  sendKumbhaMessage doc comment for what `relaunched` in the result
 *  means. Does not invalidate the session query itself: the event stream
 *  (a separate WebSocket, not react-query) is what shows the agent
 *  actually acting on it. */
export function useSendKumbhaMessage(id: string) {
  return useMutation({
    mutationFn: (content: string) => api.sendKumbhaMessage(id, content),
  });
}

/** Stop's own response is just {stopped: true}, not a full session — the
 *  session poll (budget-meter.tsx's 3s interval) picks up agent_running
 *  flipping false on its own next tick, so this only needs to invalidate
 *  rather than write a value in directly. */
export function useStopKumbhaAgent(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.stopKumbhaAgent(id),
    onSuccess: () => client.invalidateQueries({ queryKey: kumbhaSessionKey(id) }),
  });
}

/** A cheap "does this build" check, separate from a full deploy — see
 *  client.ts's buildKumbhaSession doc comment. */
export function useBuildKumbhaSession(id: string) {
  return useMutation({
    mutationFn: (dockerfilePath?: string) =>
      api.buildKumbhaSession(id, dockerfilePath),
  });
}

/** The IDE's Deploy button — builds the current workspace version and
 *  creates a real running instance from it. See client.ts's
 *  deployKumbhaSession doc comment for why each call produces a fresh
 *  instance rather than updating one in place. */
export function useDeployKumbhaSession(id: string) {
  return useMutation({
    mutationFn: (opts?: Parameters<typeof api.deployKumbhaSession>[1]) =>
      api.deployKumbhaSession(id, opts),
  });
}

// -------------------------------------------------------------------
// Kumbha workspace — the console IDE. Versioned: every save (agent or
// customer) is a new version, so the file tree/editor always reads the
// CURRENT one unless a specific version is being previewed from history.
// -------------------------------------------------------------------

function kumbhaWorkspaceKey(id: string, version?: number) {
  return ["kumbha-workspace", id, version ?? "current"] as const;
}

function kumbhaWorkspaceVersionsKey(id: string) {
  return ["kumbha-workspace-versions", id] as const;
}

/** The IDE's file tree/editor content. Polls while the session is open —
 *  the agent saves a new version after every file_editor call, and the
 *  customer watching the build page expects the tree to keep up without
 *  a manual refresh — same "poll while open" shape as useKumbhaSession.
 *  Pass `version` to pin to a specific history entry instead (no polling
 *  then: an old version's content never changes). */
export function useKumbhaWorkspace(
  id: string,
  sessionStatus: string | undefined,
  version?: number,
  enabled = true,
) {
  return useQuery({
    queryKey: kumbhaWorkspaceKey(id, version),
    queryFn: () => api.getKumbhaWorkspace(id, version),
    enabled: enabled && Boolean(id),
    refetchInterval: version === undefined && sessionStatus === "open" ? 4_000 : false,
    // A build that hasn't saved anything yet is not an error — the empty
    // tree state renders from `isError` staying false with `data`
    // undefined only on the FIRST load; a 404 here specifically means "no
    // version yet", not "something is broken", so this must not retry.
    retry: false,
  });
}

/** Every version's metadata, newest first — the history list a rollback
 *  target is picked from. */
export function useKumbhaWorkspaceVersions(id: string, enabled = true) {
  return useQuery({
    queryKey: kumbhaWorkspaceVersionsKey(id),
    queryFn: () => api.listKumbhaWorkspaceVersions(id),
    enabled: enabled && Boolean(id),
  });
}

/** The IDE's Save button. */
export function useSaveKumbhaWorkspace(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      files: KumbhaWorkspaceFile[];
      skipped?: KumbhaSkippedFile[];
    }) => api.saveKumbhaWorkspace(id, vars.files, vars.skipped),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: kumbhaWorkspaceKey(id) });
      void client.invalidateQueries({ queryKey: kumbhaWorkspaceVersionsKey(id) });
    },
  });
}

/** Rolls the session's current-version pointer back (or forward) to an
 *  existing version — never deletes anything, so this is itself
 *  reversible by rolling forward again. */
export function useRollbackKumbhaWorkspace(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.rollbackKumbhaWorkspace(id, version),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: kumbhaWorkspaceKey(id) });
      void client.invalidateQueries({ queryKey: kumbhaWorkspaceVersionsKey(id) });
    },
  });
}

/** Human-readable message for any error surfaced in the UI. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // Prefer the API's own message — it is specific and actionable
    // ("insufficient home capacity", "no home node matches architecture
    // arm64", "the allocated GPU was taken…"). Only fall back to a generic
    // phrasing when the API sent no message, so a 503 from the CPU/home
    // path is never mislabelled as a GPU-capacity blip.
    if (error.message) return error.message;
    if (error.isCapacityUnavailable) {
      // Never phrase this as missing data: the customer's instances are
      // fine, the platform just cannot see them this second.
      return "Capacity is temporarily unreachable. Your instances are unaffected.";
    }
    return "Something went wrong.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
