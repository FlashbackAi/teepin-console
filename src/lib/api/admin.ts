import { ApiError } from "./client";
import type { Account, Invoice, Project } from "./types";

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
  quantity?: number;
  unit?: string;
  unit_price?: number;
  /** Authoritative. A flat negotiated price has no meaningful quantity. */
  amount: number;
}

export interface CreateManualInvoiceRequest {
  project_id: string;
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

  getInvoice: (invoiceId: string) =>
    adminRequest<Invoice>(`/v1/admin/invoices/${invoiceId}`),

  createManualInvoice: (body: CreateManualInvoiceRequest) =>
    adminRequest<Invoice>("/v1/admin/invoices", { method: "POST", body }),

  /** Draft → open. Makes the invoice payable and visible as owed. */
  issueInvoice: (invoiceId: string) =>
    adminRequest<Invoice>(`/v1/admin/invoices/${invoiceId}/issue`, {
      method: "POST",
    }),

  voidInvoice: (invoiceId: string) =>
    adminRequest<Invoice>(`/v1/admin/invoices/${invoiceId}/void`, {
      method: "POST",
    }),

  getPricing: () =>
    adminRequest<{ vram_price_per_gb_hour: number }>("/v1/admin/pricing"),

  updatePricing: (vramPricePerGBHour: number) =>
    adminRequest<{ vram_price_per_gb_hour: number }>("/v1/admin/pricing", {
      method: "PUT",
      body: { vram_price_per_gb_hour: vramPricePerGBHour },
    }),
};
