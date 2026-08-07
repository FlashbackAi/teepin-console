import type {
  Account,
  BillingSummary,
  CreateInstanceRequest,
  CreatedAPIKey,
  APIKey,
  Instance,
  InstanceList,
  InstanceLogs,
  InstanceTypeList,
  LoginResponse,
  Project,
  RegisterResponse,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.teepin.com";

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
  /**
   * Project-scoped API key.
   *
   * Compute endpoints require an API key (`tpk_...`), not the user's
   * JWT — the JWT identifies a person, the key identifies a project, and
   * billing is per project. The console holds one for the active project
   * so instance screens can call the same endpoints the CLI does.
   */
  get apiKey() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(API_KEY_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  setApiKey(key: string) {
    localStorage.setItem(API_KEY_KEY, key);
  },
  clear() {
    for (const key of SESSION_KEYS) {
      localStorage.removeItem(key);
    }
  },
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Use the project API key instead of the user's JWT. */
  useApiKey?: boolean;
  /** Skip auth entirely (login, signup). */
  anonymous?: boolean;
};

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, useApiKey, anonymous } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!anonymous) {
    const token = useApiKey ? tokens.apiKey : tokens.access;
    if (token) headers.Authorization = `Bearer ${token}`;
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

  // -------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------
  listProjects: () =>
    request<{ projects: Project[]; count: number }>("/v1/projects"),

  createProject: (body: { name: string; description?: string }) =>
    request<Project>("/v1/projects", { method: "POST", body }),

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
  // Compute — these use the project API key, not the JWT
  // -------------------------------------------------------------------
  listInstances: () =>
    request<InstanceList>("/v1/compute/instances", { useApiKey: true }),

  getInstance: (id: string) =>
    request<Instance>(`/v1/compute/instances/${id}`, { useApiKey: true }),

  createInstance: (body: CreateInstanceRequest) =>
    request<Instance>("/v1/compute/instances", {
      method: "POST",
      body,
      useApiKey: true,
    }),

  deleteInstance: (id: string) =>
    request<{ message: string; id: string }>(`/v1/compute/instances/${id}`, {
      method: "DELETE",
      useApiKey: true,
    }),

  getInstanceLogs: (id: string, tail = 200) =>
    request<InstanceLogs>(
      `/v1/compute/instances/${id}/logs?tail=${tail}`,
      { useApiKey: true },
    ),

  listInstanceTypes: () =>
    request<InstanceTypeList>("/v1/compute/instance-types", {
      useApiKey: true,
    }),

  // -------------------------------------------------------------------
  // Billing
  // -------------------------------------------------------------------
  billingSummary: () => request<BillingSummary>("/v1/billing/summary"),
};
