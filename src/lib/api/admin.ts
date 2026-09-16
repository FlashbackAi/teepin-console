import { ApiError } from "./client";
import type {
  Account,
  CreditTransaction,
  Invoice,
  InvoiceChargeState,
  Node,
  NodeCapacity,
  NodeMetricSample,
  Pricing,
  Project,
} from "./types";

/**
 * Admin API client — the control centre.
 *
 * Deliberately separate from the customer client. It authenticates with
 * the operator's ADMIN_API_TOKEN rather than a customer JWT, and keeping
 * the two apart means a customer-facing screen can never accidentally
 * reach an admin endpoint by importing the wrong helper.
 *
 * The token is held in sessionStorage, not localStorage: it should not
 * survive closing the tab, and an operator's laptop is a likelier place
 * for a stray token to sit for months than a customer's.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.teepin.com";

const ADMIN_TOKEN_KEY = "teepin-admin-token";

export const adminToken = {
  get() {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  },
  set(token: string) {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  },
  clear() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  },
};

async function adminRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = adminToken.get();
  if (!token) {
    throw new ApiError(401, "Admin token required");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data?.error === "string") message = data.error;
    } catch {
      /* keep the status-based message */
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export interface AdminAccountSummary extends Account {
  project_count?: number;
}

export interface ManualLineItem {
  description: string;
  /** Optional: attributes this line to one project, for the per-project
   *  breakdown. Omit for an account-wide charge (platform fee, setup
   *  cost, credit) not tied to any single project's usage. */
  project_id?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  /** Authoritative. A flat negotiated price has no meaningful quantity. */
  amount: number;
}

/**
 * An invoice belongs to an ACCOUNT, not a project — the same way one AWS
 * bill covers every service under an account rather than one bill per
 * service. Per-project attribution lives on individual line items
 * instead, via ManualLineItem.project_id.
 */
export interface CreateManualInvoiceRequest {
  account_id: string;
  /** YYYY-MM-DD. */
  period_start: string;
  period_end: string;
  due_date?: string;
  currency?: string;
  notes?: string;
  line_items: ManualLineItem[];
}

export const admin = {
  /** Cheap call used to validate the token before showing the console. */
  verify: () => adminRequest<unknown>("/v1/admin/pricing"),

  listAccounts: () =>
    adminRequest<{ accounts: AdminAccountSummary[]; count: number }>(
      "/v1/admin/accounts",
    ),

  listAccountProjects: (accountId: string) =>
    adminRequest<{ projects: Project[]; count: number }>(
      `/v1/admin/accounts/${accountId}/projects`,
    ),

  listProjectInvoices: (projectId: string) =>
    adminRequest<{ invoices: Invoice[]; count: number }>(
      `/v1/admin/projects/${projectId}/invoices`,
    ),

  /** Every invoice an account owns — project-anchored and account-level
   *  (manual) together. This is the control centre's primary list. */
  listAccountInvoices: (accountId: string) =>
    adminRequest<{ invoices: Invoice[]; count: number }>(
      `/v1/admin/accounts/${accountId}/invoices`,
    ),

  getInvoice: (invoiceId: string) =>
    adminRequest<Invoice>(`/v1/admin/invoices/${invoiceId}`),

  createManualInvoice: (body: CreateManualInvoiceRequest) =>
    adminRequest<Invoice>("/v1/admin/invoices", { method: "POST", body }),

  /** Builds a DRAFT usage invoice for the account's metered activity over
   *  the period, one line item per (project, resource). Like a manual
   *  invoice it is a draft to review before issuing. */
  generateUsageInvoice: (
    accountId: string,
    body: { period_start: string; period_end: string },
  ) =>
    adminRequest<Invoice>(
      `/v1/admin/accounts/${accountId}/usage-invoices`,
      { method: "POST", body },
    ),

  /** Grants operator credit to an account. amount is capped server-side;
   *  reason is required (an unexplained credit is a fraud signal). */
  grantCredit: (
    accountId: string,
    body: { amount: number; reason: string; expires_at?: string },
  ) =>
    adminRequest<{ balance: number }>(
      `/v1/admin/accounts/${accountId}/credits`,
      { method: "POST", body },
    ),

  /** Balance + full ledger for the control-centre credit view. */
  getAccountCredits: (accountId: string) =>
    adminRequest<{ balance: number; transactions: CreditTransaction[] }>(
      `/v1/admin/accounts/${accountId}/credits`,
    ),

  /** Draft → open. Makes the invoice payable and visible as owed. */
  issueInvoice: (invoiceId: string) =>
    adminRequest<Invoice>(`/v1/admin/invoices/${invoiceId}/issue`, {
      method: "POST",
    }),

  voidInvoice: (invoiceId: string) =>
    adminRequest<Invoice>(`/v1/admin/invoices/${invoiceId}/void`, {
      method: "POST",
    }),

  /** Charge an open usage invoice now, off-session, against the account's
   *  verified card — an operator "collect now" / manual retry. Runs the
   *  same unit of work the background collector uses: net of credits,
   *  idempotent, safe to press twice. Returns the refreshed invoice. A card
   *  decline is not an error here — it records the failed attempt and
   *  returns the (still-open) invoice with an incremented attempt count. */
  chargeInvoice: (invoiceId: string) =>
    adminRequest<Invoice>(`/v1/admin/invoices/${invoiceId}/charge`, {
      method: "POST",
    }),

  /** Operator-only charge progress for an invoice: attempts, last error,
   *  PaymentIntent id. Kept separate from the invoice body so the
   *  customer-facing invoice never carries retry internals. */
  getInvoiceChargeState: (invoiceId: string) =>
    adminRequest<InvoiceChargeState>(
      `/v1/admin/invoices/${invoiceId}/charge-state`,
    ),

  getPricing: () =>
    adminRequest<Pricing>("/v1/admin/pricing"),

  updatePricing: (vramPricePerGBHour: number) =>
    adminRequest<Pricing>("/v1/admin/pricing", {
      method: "PUT",
      body: { vram_price_per_gb_hour: vramPricePerGBHour },
    }),

  /** Home-compute CPU + memory rates. Zero is valid ("do not charge"), so
   *  neither field is required — a home CPU instance bills nothing until a
   *  rate is set. */
  updateCPUPricing: (body: {
    cpu_price_per_core_hour: number;
    memory_price_per_gb_hour: number;
  }) =>
    adminRequest<Pricing>("/v1/admin/pricing/cpu", { method: "PUT", body }),

  /** P-core/E-core rates for a home-node instance placed with a detected
   *  split (see cmd/teepin-hostprobe). cpu_price_per_core_hour above
   *  remains the rate for an instance with no detected split — these two
   *  are additive, not a replacement. Zero is valid ("do not charge"). */
  updatePECorePricing: (body: {
    p_core_price_per_hour: number;
    e_core_price_per_hour: number;
  }) =>
    adminRequest<Pricing>("/v1/admin/pricing/cpu-pe", { method: "PUT", body }),

  updateStoragePricing: (storagePricePerGBMonth: number) =>
    adminRequest<Pricing>("/v1/admin/pricing/storage", {
      method: "PUT",
      body: { storage_price_per_gb_month: storagePricePerGBMonth },
    }),

  /** Kumbha Gateway per-million-token rates. Zero is valid ("do not
   *  charge"), same contract as CPU/storage — every Kumbha session bills
   *  nothing until an operator sets these. */
  updateLLMPricing: (body: {
    llm_price_per_million_input: number;
    llm_price_per_million_output: number;
  }) =>
    adminRequest<Pricing>("/v1/admin/pricing/llm", { method: "PUT", body }),

  // --- Nodes (home-compute pilot) -----------------------------------------
  // These routes exist only when the control plane has HOME_COMPUTE_ENABLED;
  // otherwise they 404 and the Nodes page shows a "not enabled" state.

  /** Every persisted node — home and datacenter — for the control centre,
   *  each with its capacity breakdown (detected / rentable / used / free). */
  listNodes: () =>
    adminRequest<{ nodes: Node[]; capacity?: NodeCapacity[]; count: number }>(
      "/v1/admin/nodes",
    ),

  /** Set how much of a node to rent out. Server caps at detected specs
   *  (400 on over-commit). Zero offers nothing. */
  setNodeReservation: (
    nodeId: string,
    body: { cpu_cores: number; memory_gb: number },
  ) =>
    adminRequest<{ message: string }>(
      `/v1/admin/nodes/${nodeId}/reservation`,
      { method: "PUT", body },
    ),

  /** Rename a node (operator label). */
  renameNode: (nodeId: string, nodeName: string) =>
    adminRequest<{ message: string }>(`/v1/admin/nodes/${nodeId}`, {
      method: "PATCH",
      body: { node_name: nodeName },
    }),

  /** Delete a node. 409 if it still has active instances (terminate them or
   *  disable the node first). */
  deleteNode: (nodeId: string) =>
    adminRequest<{ message: string }>(`/v1/admin/nodes/${nodeId}`, {
      method: "DELETE",
    }),

  /** Mints a one-time enrollment token. The class is fixed HERE by the
   *  operator; the enrolling agent cannot choose or change it. Returns the
   *  plaintext token exactly once. */
  createNodeEnrollmentToken: (body: {
    label: string;
    class?: "home" | "datacenter";
    ttl_minutes?: number;
  }) =>
    adminRequest<{
      token: string;
      class: string;
      label: string;
      expires_at: string;
    }>("/v1/admin/nodes/enrollment-tokens", { method: "POST", body }),

  /** Takes a node out of service: no longer schedulable, credential stops
   *  authenticating. */
  disableNode: (nodeId: string) =>
    adminRequest<{ message: string; id: string }>(
      `/v1/admin/nodes/${nodeId}/disable`,
      { method: "POST" },
    ),

  /** This node's utilization history, oldest first. `since` is a Go
   *  duration string ("1h", "24h"); omitted uses the server's own
   *  default window (1h) rather than the 7-day max. */
  getNodeMetrics: (nodeId: string, since?: string) =>
    adminRequest<{ node_id: string; samples: NodeMetricSample[] }>(
      `/v1/admin/nodes/${nodeId}/metrics${since ? `?since=${encodeURIComponent(since)}` : ""}`,
    ),
};
