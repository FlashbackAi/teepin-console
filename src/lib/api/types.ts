/**
 * Types mirroring the TEEPIN API's wire format.
 *
 * Hand-written rather than generated: the Go API has no OpenAPI spec
 * yet, and a hand-written file that is honest about what the server
 * actually returns beats a generated one derived from a spec nobody
 * maintains. When the spec exists, this file is what it replaces.
 *
 * Field names match the JSON exactly (snake_case). Renaming to camelCase
 * at the boundary would mean every field appears under two names across
 * the codebase, and the API docs would stop matching the client.
 */

// ---------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------

export type AccountType = "personal" | "organization";
export type UserRole = "owner" | "admin" | "member" | "billing";

export interface Account {
  id: string;
  account_number: string;
  account_number_formatted: string;
  alias: string;
  type: AccountType;
  display_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  account_id: string;
  email: string;
  role: UserRole;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegisterResponse {
  account: Account;
  user: User;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

// ---------------------------------------------------------------------
// Projects and keys
// ---------------------------------------------------------------------

export interface Project {
  id: string;
  account_id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface APIKey {
  id: string;
  project_id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export interface CreatedAPIKey {
  /** The full secret. Returned ONCE, at creation, and never again. */
  key: string;
  api_key: APIKey;
}

// ---------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------

/**
 * Instance lifecycle.
 *
 * `pending` is the normal result of a create — the image is still
 * pulling, and the command may not have reached the GPU cluster yet.
 * The console must never treat a create response as a running instance.
 */
export type InstanceStatus =
  | "pending"
  | "running"
  | "failed"
  | "terminated";

export interface Instance {
  id: string;
  name: string;
  image: string;
  status: InstanceStatus;
  /** Why a non-running instance is in that state, in customer terms. */
  status_message?: string;
  instance_type?: string;
  price_per_hour?: number;
  /** What the customer asked for. */
  gpu_vram?: string;
  /** What was reserved and is billed — may exceed the request. */
  allocated_vram?: string;
  /** Present only when allocated > requested. Show it prominently. */
  allocation_note?: string;
  cpu_units: number;
  memory: string;
  endpoint?: string;
  public_ip?: string;
  dns_name?: string;
  tls_enabled?: boolean;
  tls_ready?: boolean;
  internal_ip?: string;
  created_at: string;
  updated_at: string;
  labels?: Record<string, string>;
}

export interface InstanceList {
  instances: Instance[];
  count: number;
}

export interface CreateInstanceRequest {
  name: string;
  image: string;
  /** e.g. "10GB". Omit for a CPU-only instance. */
  gpu_vram?: string;
  cpu_units: number;
  /** e.g. "8GB". */
  memory: string;
  command?: string[];
  args?: string[];
  env?: Record<string, string>;
  ports?: { container: number }[];
  labels?: Record<string, string>;
}

export interface InstanceType {
  name: string;
  gpu_vram: string;
  gpu_memory_gb: number;
  cpu_units: number;
  memory: string;
  price_per_hour: number;
  description: string;
}

export interface InstanceTypeList {
  instance_types: InstanceType[];
  pricing: string;
}

export interface InstanceLogs {
  instance_id: string;
  tail: number;
  logs: string;
}

// ---------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------

export interface BillingService {
  service: string;
  quantity: number;
  unit: string;
  cost: number;
  instances: number;
}

export interface BillingProject {
  project_id: string;
  project_name: string;
  cost: number;
  services: BillingService[];
}

export interface BillingSummary {
  account_id: string;
  period_start: string;
  period_end: string;
  total_cost: number;
  currency: string;
  projects: BillingProject[];
}
