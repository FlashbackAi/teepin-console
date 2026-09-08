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
  InstanceMetrics,
  InstanceTypeList,
  Invoice,
  KumbhaSession,
  KumbhaSessionInstance,
  KumbhaSkippedFile,
  KumbhaWorkspace,
  KumbhaWorkspaceFile,
  KumbhaWorkspaceVersionInfo,
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

// Deduplicates concurrent refresh attempts into one in-flight request.
// Without this, several queries 401-ing around the same moment (routine
// with the access token's 15-minute TTL — several panels poll in
// parallel) would each fire their own /v1/auth/refresh call. Since a
// refresh ROTATES the refresh token, only the first of those calls would
// actually succeed — every other one redeems an already-spent refresh
// token and fails, bouncing the customer to /login despite the first
// call having refreshed them successfully moments earlier.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = tokens.refresh;
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${BASE_URL}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) return false;
      const data = await response.json();
      if (typeof data?.access_token !== "string" || typeof data?.refresh_token !== "string") {
        return false;
      }
      tokens.set(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function doFetch(
  path: string,
  method: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

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

  let response = await doFetch(path, method, body, headers);

  // A 401 on an authenticated call almost always means the 15-minute
  // access token expired mid-session, not that the customer's
  // credentials are wrong — the access token is refreshed silently and
  // the SAME request retried once. Only on a second 401 (refresh itself
  // failed — the refresh token is also expired/invalid) does this fall
  // through to the ordinary error path, which is what AuthGuard's
  // existing 401 handler turns into a sign-out. `anonymous` calls
  // (login, register) never retry: a 401 there is genuinely wrong
  // credentials, and they carry no Authorization header to refresh.
  if (response.status === 401 && !anonymous && tokens.access) {
    if (await tryRefresh()) {
      headers.Authorization = `Bearer ${tokens.access}`;
      response = await doFetch(path, method, body, headers);
    }
  }

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

  /** This instance's utilization history, oldest first. `since` is a Go
   *  duration string ("1h", "24h"); omitted uses the server's own
   *  default window (1h) rather than the 7-day max. */
  getInstanceMetrics: (id: string, since?: string) =>
    request<InstanceMetrics>(
      `/v1/compute/instances/${id}/metrics${since ? `?since=${encodeURIComponent(since)}` : ""}`,
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

  // -------------------------------------------------------------------
  // Kumbha — project-scoped, same JWT + X-Project-ID pattern as compute.
  // -------------------------------------------------------------------

  /** Pre-authorises a build session's spend and — when `prompt` is given
   *  — launches the agent in the same call, so "start building" is one
   *  request rather than create-then-start. */
  createKumbhaSession: (body: {
    budget: number;
    label?: string;
    prompt?: string;
  }) =>
    request<KumbhaSession>("/v1/kumbha/sessions", {
      method: "POST",
      body,
      projectScoped: true,
    }),

  getKumbhaSession: (id: string) =>
    request<KumbhaSession>(`/v1/kumbha/sessions/${id}`, {
      projectScoped: true,
    }),

  /** Every compute instance this session has ever created — deploy's own
   *  bookkeeping (app_instance_id) AND anything created via a raw
   *  create_instance call, which historically left no trace on the
   *  session at all (found live 2026-08-30/31: a broken-deploy workaround
   *  produced two untracked instances from one build). Read-only; delete
   *  an unwanted one via the existing deleteInstance. */
  listKumbhaSessionInstances: (id: string) =>
    request<{ instances: KumbhaSessionInstance[] }>(
      `/v1/kumbha/sessions/${id}/instances`,
      { projectScoped: true },
    ),

  /** The active project's Kumbha build history, most recent first — read
   *  only, a way to find and revisit a past build, not to resume its
   *  conversation (see build/[id]/page.tsx's own doc comment on why
   *  that's separate, unbuilt work). */
  listKumbhaSessions: () =>
    request<{ sessions: KumbhaSession[]; count: number }>("/v1/kumbha/sessions", {
      projectScoped: true,
    }),

  /** Bulk-removes build sessions from history — best-effort, not
   *  all-or-nothing: a still-open (actively building) session in the
   *  batch comes back in `skipped`, not as a failure of the whole call. */
  deleteKumbhaSessions: (ids: string[]) =>
    request<{ deleted: string[]; skipped: string[] }>("/v1/kumbha/sessions/bulk-delete", {
      method: "POST",
      body: { ids },
      projectScoped: true,
    }),

  /** Flips the pre-deploy cost-approval gate — called when the customer
   *  approves the itemised Deployment Plan shown in the activity feed. */
  approveKumbhaDeploy: (id: string) =>
    request<KumbhaSession>(`/v1/kumbha/sessions/${id}/approve-deploy`, {
      method: "POST",
      projectScoped: true,
    }),

  /** Raises an open session's pre-authorised spend cap — the live budget
   *  meter's "raise budget" control, the replacement for the composer's
   *  old up-front budget picker. `budget` must be strictly higher than
   *  the session's current one; the server rejects anything else. */
  updateKumbhaBudget: (id: string, budget: number) =>
    request<KumbhaSession>(`/v1/kumbha/sessions/${id}/budget`, {
      method: "PATCH",
      body: { budget },
      projectScoped: true,
    }),

  /** Interrupts a session's currently-running agent turn immediately — a
   *  hard kill, not a graceful pause (see the backend's own
   *  Gateway.StopAgent doc comment for why). Replaces the old "Close
   *  session" action: nothing about stopping a run should stop the
   *  customer from sending another message afterward, so this does not
   *  change the session's own status or block future chat. */
  stopKumbhaAgent: (id: string) =>
    request<{ stopped: boolean }>(`/v1/kumbha/sessions/${id}/stop`, {
      method: "POST",
      projectScoped: true,
    }),

  /** Issues a short-lived, single-use ticket for the activity feed's
   *  WebSocket attach step — same shape and reasoning as
   *  createExecSession's ticket. */
  createKumbhaEventTicket: (id: string) =>
    request<ExecTicket>(`/v1/kumbha/sessions/${id}/events`, {
      method: "POST",
      projectScoped: true,
    }),

  /** "Chat + resume" — the console's chat input. Reaches the SAME running
   *  conversation if the agent pod is still alive (queued for its own
   *  poll loop), or relaunches the agent with this as a fresh prompt if
   *  it already exited (`relaunched: true` in the response) — see
   *  pkg/kumbha's DeliverMessage doc comment for why a relaunch has no
   *  memory of the earlier conversation even though the workspace it
   *  built does survive. */
  sendKumbhaMessage: (id: string, content: string) =>
    request<{ delivered: boolean; relaunched: boolean }>(
      `/v1/kumbha/sessions/${id}/messages`,
      { method: "POST", body: { content }, projectScoped: true },
    ),

  /** Builds a container image from the session's CURRENT saved workspace
   *  version — an IDE edit or a version rollback is reflected, since the
   *  build pod fetches the same archive the file browser and ZIP download
   *  read (see pkg/kumbha's MintWorkspaceFetchToken). Returns the built
   *  image reference only; does NOT create or update a running instance —
   *  use deployKumbhaSession for that. Exposed mainly so the console can
   *  offer a cheap "does this even build" check separate from a full
   *  deploy. */
  buildKumbhaSession: (id: string, dockerfilePath?: string) =>
    request<{ image_ref: string }>(`/v1/kumbha/sessions/${id}/build`, {
      method: "POST",
      body: dockerfilePath ? { dockerfile_path: dockerfilePath } : {},
      projectScoped: true,
    }),

  /** The IDE's Deploy button — builds the current workspace version and
   *  creates a real, running compute instance from it (billed and
   *  manageable exactly like one the customer created by hand). Each call
   *  produces a FRESH instance and tears down whatever the session's
   *  previous deploy created: the compute layer has no in-place "swap the
   *  image" capability yet, so the returned endpoint hostname changes on
   *  every deploy — the same behaviour the agent's own `deploy` tool
   *  already has today, not a new limitation. */
  deployKumbhaSession: (
    id: string,
    opts?: {
      dockerfilePath?: string;
      name?: string;
      cpuUnits?: number;
      memoryGb?: number;
      storageGb?: number;
    },
  ) =>
    request<{
      image_ref: string;
      instance_id: string;
      endpoint: string;
      status: string;
      price_per_hour: number;
    }>(`/v1/kumbha/sessions/${id}/deploy`, {
      method: "POST",
      body: {
        dockerfile_path: opts?.dockerfilePath,
        name: opts?.name,
        cpu_units: opts?.cpuUnits,
        memory_gb: opts?.memoryGb,
        storage_gb: opts?.storageGb,
      },
      projectScoped: true,
    }),

  // -------------------------------------------------------------------
  // Kumbha workspace — versioned, not overwrite-in-place. Every save
  // (the agent's automatic upload, or the customer's Save in the console
  // IDE) creates a new version and moves the "current" pointer; nothing
  // is ever deleted, so a rollback is always available. See migration
  // 025 and pkg/kumbha/workspace.go for the storage shape.
  // -------------------------------------------------------------------

  /** The IDE's file tree/editor content — the current version by
   *  default, or a specific one via `version` (used to preview a
   *  history entry before deciding whether to roll back to it). */
  getKumbhaWorkspace: (id: string, version?: number) =>
    request<KumbhaWorkspace>(
      `/v1/kumbha/sessions/${id}/workspace${version ? `?version=${version}` : ""}`,
      { projectScoped: true },
    ),

  /** The IDE's Save button — persists the customer's own edits as a new
   *  version, recorded as created_by="customer" so the history list can
   *  tell it apart from the agent's own automatic saves. */
  saveKumbhaWorkspace: (
    id: string,
    files: KumbhaWorkspaceFile[],
    skipped: KumbhaSkippedFile[] = [],
  ) =>
    request<{ version: number; files: number; skipped: number }>(
      `/v1/kumbha/sessions/${id}/workspace`,
      { method: "POST", body: { files, skipped }, projectScoped: true },
    ),

  /** Every version's metadata (no file content), newest first — the
   *  history list a rollback target is picked from. */
  listKumbhaWorkspaceVersions: (id: string) =>
    request<{ versions: KumbhaWorkspaceVersionInfo[] }>(
      `/v1/kumbha/sessions/${id}/workspace/versions`,
      { projectScoped: true },
    ),

  /** Moves the current-version pointer to an existing version — the undo
   *  for a customer edit or an agent step that broke something. Nothing
   *  is deleted, so a rollback can itself be undone by rolling forward
   *  again. */
  rollbackKumbhaWorkspace: (id: string, version: number) =>
    request<{ current_version: number }>(
      `/v1/kumbha/sessions/${id}/workspace/rollback`,
      { method: "POST", body: { version }, projectScoped: true },
    ),

  /** Downloads the current (or a specific `version`) workspace as a ZIP
   *  and saves it via the browser — how a customer gets their source
   *  without us ever handing out a GitHub URL (see migration 025's own
   *  note on why this replaces a git remote). A raw fetch, not
   *  request(): the response is binary, not JSON, so it needs its own
   *  auth headers and its own blob handling rather than request()'s
   *  JSON-only parsing. */
  downloadKumbhaWorkspace: async (id: string, version?: number) => {
    const headers: Record<string, string> = {};
    if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
    if (activeProject.current) headers["X-Project-ID"] = activeProject.current;

    const path = `/v1/kumbha/sessions/${id}/workspace/archive${version ? `?version=${version}` : ""}`;
    const response = await fetch(`${BASE_URL}${path}`, { headers });
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

    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match?.[1] ?? `kumbha-${id.slice(0, 8)}.zip`;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  /** The deployment thumbnail's PNG bytes as an object URL the caller can
   *  hand straight to an <img src>, or null if none has been captured yet
   *  (a 404 — see GetKumbhaScreenshot's own doc comment: never a
   *  placeholder image). A raw fetch, not request(): the response is
   *  binary, not JSON, same reasoning as downloadKumbhaWorkspace — and a
   *  plain <img src> cannot carry the Authorization/X-Project-ID headers
   *  this endpoint requires, so the caller must fetch it as a blob first.
   *  The returned URL is only valid in this tab and must be revoked
   *  (URL.revokeObjectURL) once the caller is done with it. */
  fetchKumbhaScreenshot: async (id: string): Promise<string | null> => {
    const headers: Record<string, string> = {};
    if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
    if (activeProject.current) headers["X-Project-ID"] = activeProject.current;

    const response = await fetch(`${BASE_URL}/v1/kumbha/sessions/${id}/screenshot`, { headers });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new ApiError(response.status, `Request failed (${response.status})`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
};
