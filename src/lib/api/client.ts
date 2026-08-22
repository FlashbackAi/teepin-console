import type {
  Account,
  BillingSummary,
  ConvertToOrganizationRequest,
  CreateInstanceRequest,
  CreatedAPIKey,
  APIKey,
  ExecTicket,
  HomeCapacity,
  ImagePortsResponse,
  Instance,
  InstanceList,
  InstanceLogs,
  InstanceTypeList,
  Invoice,
  LoginResponse,
  PaymentMethod,
  Project,
  RegisterResponse,
  UpdateAccountRequest,
  UpdateProjectRequest,
  User,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.teepin.com";

/** The same origin as BASE_URL, as a WebSocket URL (http->ws,
 *  https->wss) — used only by the terminal's attach socket. */
export function wsBaseUrl(): string {
  return BASE_URL.replace(/^http/, "ws");
}

/**
 * An error carrying the HTTP status, so callers can branch on it.
 *
 * Status matters here more than usual: the API deliberately returns 404
 * rather than 403 for another tenant's resource (so existence does not
 * leak), and 503 rather than 500 when GPU capacity is unreachable (so
 * clients retry instead of treating it as data loss).
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /**
   * True when the platform is temporarily unable to reach GPU capacity.
   *
   * This is NOT "your instances are gone" — accounts, billing and usage
   * keep working, and the UI must say so rather than implying data loss.
   */
  get isCapacityUnavailable() {
    return this.status === 503;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

/**
 * Token storage.
 *
 * localStorage rather than a cookie because the console is a static SPA
 * calling a different origin: there is no server to set an HttpOnly
 * cookie, and a JS-readable cookie offers no protection localStorage
 * lacks. The real XSS mitigation is that this app renders no
 * user-supplied HTML.
 */
const ACCESS_TOKEN_KEY = "teepin-access-token";
const REFRESH_TOKEN_KEY = "teepin-refresh-token";
const API_KEY_KEY = "teepin-api-key";

/**
 * Everything that belongs to a signed-in session.
 *
 * Listed here rather than at each call site so `clear()` cannot fall out
 * of step when a key is added — a leftover key means the next person to
 * sign in on this machine inherits some of the previous account's state.
 * The theme preference is deliberately absent: it belongs to the device,
 * not the session.
 */
const SESSION_KEYS = [
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  API_KEY_KEY,
  "teepin-active-project",
];

export const tokens = {
  get access() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  get refresh() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  clear() {
    for (const key of SESSION_KEYS) {
      localStorage.removeItem(key);
    }
  },
};

/**
 * The project the console is currently operating in, mirrored here so
 * `request()` can attach it to compute calls without importing
 * active-project.tsx (which itself imports this module — a cycle).
 *
 * Compute endpoints authenticate with the user's own JWT plus this project
 * id in the X-Project-ID header (verified server-side against the caller's
 * account — see pkg/auth/middleware.go). This is the same model AWS's
 * console uses: sign-in credentials reach the API directly, scoped to
 * whichever resource you're viewing, rather than the console minting and
 * managing a second long-lived credential of its own. Real API keys
 * (`tpk_...`) stay purely opt-in, for a customer's own CLI/CI use — Settings
 * → API keys.
 */
export const activeProject = {
  current: null as string | null,
  set(id: string | null) {
    activeProject.current = id;
  },
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Skip auth entirely (login, signup). */
  anonymous?: boolean;
  /** This call is project-scoped (a compute endpoint) — attach
   *  X-Project-ID from the active project alongside the JWT. */
  projectScoped?: boolean;
};

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, anonymous, projectScoped } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!anonymous) {
    if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
    if (projectScoped && activeProject.current) {
      headers["X-Project-ID"] = activeProject.current;
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    // The API returns {"error": "..."} consistently, but a proxy or load
    // balancer may return HTML — so parsing must not throw over the
    // original failure and hide it.
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data?.error === "string") message = data.error;
    } catch {
      /* keep the status-based message */
    }
    throw new ApiError(response.status, message);
  }

  // 204 and other empty responses have no body to parse.
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  // -------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------
  register: (body: {
    type: "personal" | "organization";
    display_name: string;
    email: string;
    password: string;
  }) =>
    request<RegisterResponse>("/v1/accounts", {
      method: "POST",
      body,
      anonymous: true,
    }),

  login: (body: { email: string; password: string }) =>
    request<LoginResponse>("/v1/auth/login", {
      method: "POST",
      body,
      anonymous: true,
    }),

  // /v1/accounts/current, not /v1/accounts — the latter only accepts
  // POST (registration), so a GET there 404s and the console renders
  // with no account name.
  currentAccount: () => request<Account>("/v1/accounts/current"),

  updateAccount: (body: UpdateAccountRequest) =>
    request<Account>("/v1/accounts/current", { method: "PATCH", body }),

  convertToOrganization: (body: ConvertToOrganizationRequest) =>
    request<Account>("/v1/accounts/current/convert-to-organization", {
      method: "POST",
      body,
    }),

  listAccountUsers: () =>
    request<{ users: User[]; count: number }>("/v1/accounts/current/users"),

  // -------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------
  listProjects: () =>
    request<{ projects: Project[]; count: number }>("/v1/projects"),

  createProject: (body: { name: string; description?: string }) =>
    request<Project>("/v1/projects", { method: "POST", body }),

  updateProject: (id: string, body: UpdateProjectRequest) =>
    request<Project>(`/v1/projects/${id}`, { method: "PATCH", body }),

  deleteProject: (id: string) =>
    request<{ message: string; id: string }>(`/v1/projects/${id}`, {
      method: "DELETE",
    }),

  createApiKey: (projectId: string, body: { name: string }) =>
    request<CreatedAPIKey>(`/v1/projects/${projectId}/api-keys`, {
      method: "POST",
      body,
    }),

  listApiKeys: (projectId: string) =>
    request<{ api_keys: APIKey[] }>(`/v1/projects/${projectId}/api-keys`),

  revokeApiKey: (projectId: string, keyId: string) =>
    request<void>(`/v1/projects/${projectId}/api-keys/${keyId}`, {
      method: "DELETE",
    }),

  // -------------------------------------------------------------------
  // Compute — project-scoped: the user's JWT + X-Project-ID
  // -------------------------------------------------------------------
  listInstances: () =>
    request<InstanceList>("/v1/compute/instances", { projectScoped: true }),

  getInstance: (id: string) =>
    request<Instance>(`/v1/compute/instances/${id}`, { projectScoped: true }),

  createInstance: (body: CreateInstanceRequest) =>
    request<Instance>("/v1/compute/instances", {
      method: "POST",
      body,
      projectScoped: true,
    }),

  deleteInstance: (id: string) =>
    request<{ message: string; id: string }>(`/v1/compute/instances/${id}`, {
      method: "DELETE",
      projectScoped: true,
    }),

  getInstanceLogs: (id: string, tail = 200, timestamps = false) =>
    request<InstanceLogs>(
      `/v1/compute/instances/${id}/logs?tail=${tail}${timestamps ? "&timestamps=true" : ""}`,
      { projectScoped: true },
    ),

  /** Issues a short-lived, single-use ticket for the terminal's
   *  WebSocket attach step. container/command are both optional — an
   *  omitted command lets the agent probe for a shell (/bin/bash, then
   *  /bin/sh); container is only meaningful for a pod with more than
   *  one, which the platform does not create today. */
  createExecSession: (
    id: string,
    body?: { container?: string; command?: string[] },
  ) =>
    request<ExecTicket>(`/v1/compute/instances/${id}/exec`, {
      method: "POST",
      body: body ?? {},
      projectScoped: true,
    }),

  /** Home CPU capacity: which tiers fit right now + free totals. Used by the
   *  create dialog to enable/disable home tiers. 404 when home compute is off. */
  homeCapacity: () =>
    request<HomeCapacity>("/v1/compute/home-capacity", { projectScoped: true }),

  listInstanceTypes: () =>
    request<InstanceTypeList>("/v1/compute/instance-types", {
      projectScoped: true,
    }),

  /** Ports a container image declares via EXPOSE — used to default the
   *  create-instance form's Port field. Never errors in practice: an
   *  unresolvable image (private, unlisted registry, no EXPOSE) just
   *  returns an empty list, so the customer falls back to typing a port. */
  imagePorts: (image: string) =>
    request<ImagePortsResponse>(
      `/v1/compute/image-ports?image=${encodeURIComponent(image)}`,
      { projectScoped: true },
    ),

  // -------------------------------------------------------------------
  // Billing
  // -------------------------------------------------------------------
  billingSummary: () => request<BillingSummary>("/v1/billing/summary"),

  // Account-scoped since the account-level invoicing redesign: returns
  // every invoice the caller's account owns, usage and manual together.
  // Uses the JWT session, not the project API key — an invoice is not a
  // compute resource, and requiring a project key would make an
  // account-level invoice (no single project) awkward to reach.
  listInvoices: () =>
    request<{ invoices: Invoice[]; count: number }>("/v1/billing/invoices"),

  getInvoice: (id: string) => request<Invoice>(`/v1/billing/invoices/${id}`),

  // Returns a short-lived presigned S3 URL to download the invoice PDF.
  //
  // Two steps by design: this call (same-origin, authed) asks the API
  // for the URL, and the CALLER then navigates the browser to it. We do
  // NOT fetch() the S3 URL ourselves — a cross-origin fetch into S3 is
  // blocked by CORS (S3 sends no Access-Control-Allow-Origin). Navigation
  // is not subject to CORS, and the presigned URL already asks S3 for a
  // Content-Disposition: attachment response, so the browser saves it as
  // a file. See downloadInvoicePdf() in hooks/util callers.
  invoicePdfUrl: (id: string) =>
    request<{ url: string }>(`/v1/billing/invoices/${id}/pdf`),

  // Remaining account credit (spent before the card is charged). Shown on
  // the billing overview when non-zero.
  creditBalance: () =>
    request<{ balance: number }>("/v1/billing/credits"),

  // -------------------------------------------------------------------
  // Payment methods — account-scoped, plain JWT (a card belongs to the
  // account, not a project — no X-Project-ID here).
  // -------------------------------------------------------------------
  listPaymentMethods: () =>
    request<{ payment_methods: PaymentMethod[]; count: number }>(
      "/v1/accounts/current/payment-methods",
    ),

  // Starts adding a card: returns the SetupIntent client secret the
  // browser hands to Stripe.js to confirm the card, plus the id of the
  // pending payment-method row this call creates (before any card is
  // entered — Stripe requires the SetupIntent to exist before the Payment
  // Element can render). The card only becomes usable once Stripe's
  // webhook confirms it. payment_method_id exists so the caller can clean
  // this row up via removePaymentMethod() if the flow is never completed
  // — otherwise a cancelled or failed attempt leaves a permanent orphaned
  // "Validating…" card with nothing able to remove it (found live
  // 2026-08-21).
  createSetupIntent: () =>
    request<{ client_secret: string; payment_method_id: string }>(
      "/v1/accounts/current/payment-methods/setup-intent",
      { method: "POST" },
    ),

  removePaymentMethod: (id: string) =>
    request<{ removed: boolean }>(
      `/v1/accounts/current/payment-methods/${id}`,
      { method: "DELETE" },
    ),

  setDefaultPaymentMethod: (id: string) =>
    request<{ updated: boolean }>(
      `/v1/accounts/current/payment-methods/${id}/default`,
      { method: "POST" },
    ),
};
