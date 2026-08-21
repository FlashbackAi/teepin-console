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
  UpdateAccountRequest,
  UpdateProjectRequest,
} from "./types";

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
  instanceTypes: ["instance-types"] as const,
  billing: ["billing"] as const,
  invoices: ["invoices"] as const,
  invoice: (id: string) => ["invoice", id] as const,
  paymentMethods: ["payment-methods"] as const,
  creditBalance: ["credit-balance"] as const,
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

export function useInstanceLogs(id: string, enabled = true, tail = 200) {
  return useQuery({
    queryKey: ["logs", id, tail],
    queryFn: () => api.getInstanceLogs(id, tail),
    enabled,
    // Logs are a live view while the customer is looking at them.
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
