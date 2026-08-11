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
  /** Organization-only; absent on personal accounts until converted. */
  legal_name?: string;
  tax_id?: string;
  billing_email?: string;
  billing_address?: string;
  /** ISO 3166-1 alpha-2. */
  country?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateAccountRequest {
  /** Omitted fields are left unchanged — not cleared. */
  display_name?: string;
  legal_name?: string;
  tax_id?: string;
  billing_email?: string;
  billing_address?: string;
  country?: string;
}

export interface ConvertToOrganizationRequest {
  legal_name: string;
  tax_id?: string;
  country?: string;
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

export type Environment = "dev" | "staging" | "prod";

export interface Project {
  id: string;
  account_id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  /** Empty when the customer has not declared one. */
  environment?: Environment | "";
  created_at: string;
  updated_at: string;
}

export interface UpdateProjectRequest {
  /** Omitted fields are left unchanged — not cleared. */
  name?: string;
  description?: string;
  environment?: Environment | "";
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

/**
 * Invoice lifecycle.
 *
 * `draft` is editable and NOT owed — it exists so an operator can build
 * an invoice, check it, and issue it deliberately. Everything after
 * `open` is a financial record: void rather than delete, always.
 */
export type InvoiceStatus =
  | "draft"
  | "open"
  | "paid"
  | "void"
  | "uncollectible";

export interface InvoiceLineItem {
  id?: string;
  description: string;
  /** Attributes this line to a project, for the per-project breakdown.
   *  Absent for account-wide charges (platform fee, credit) not tied to
   *  any single project's usage. */
  project_id?: string;
  /** Read-only, joined at fetch time — never write this. */
  project_name?: string;
  /** Context for the amount — "120.5 GPU-hours × $1.00". */
  quantity?: number;
  unit?: string;
  unit_price?: number;
  /** Authoritative: a negotiated flat price has no meaningful quantity. */
  amount: number;
}

export interface Invoice {
  id: string;
  account_id: string;
  /** Set only for a project-anchored (usage-path) invoice. Account-level
   *  and manual invoices are nil here — see InvoiceLineItem.project_id
   *  for their per-project breakdown instead. */
  project_id?: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  /** "manual" (a person issued it) or "usage" (the meter produced it). */
  source: "manual" | "usage";
  currency: string;
  due_date?: string;
  notes?: string;
  paid_at?: string;
  /** Bill-to details snapshotted at issue time, not read live. */
  bill_to_name?: string;
  bill_to_email?: string;
  bill_to_address?: string;
  bill_to_tax_id?: string;
  bill_to_account_number?: string;
  line_items?: InvoiceLineItem[];
  created_at: string;
  updated_at: string;
  /** True when a downloadable PDF document has been generated and stored
   *  for this invoice. Derived server-side from the stored S3 key; the
   *  key itself is never exposed. False for invoices issued before PDF
   *  storage existed. */
  pdf_available?: boolean;
  /** When the stored document was rendered, if one exists. */
  pdf_generated_at?: string;
}

export interface BillingSummary {
  account_id: string;
  period_start: string;
  period_end: string;
  total_cost: number;
  currency: string;
  projects: BillingProject[];
}

/**
 * A stored card.
 *
 * `status` gates everything: only a `verified` card counts toward the
 * provisioning gate and can be a default. A `pending` card is one whose
 * SetupIntent Stripe has not yet confirmed.
 */
export type PaymentMethodStatus = "pending" | "verified" | "failed" | "removed";

export interface PaymentMethod {
  id: string;
  account_id: string;
  type: string;
  brand?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
  status: PaymentMethodStatus;
  verified_at?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** One row of the append-only credit ledger. */
export interface CreditTransaction {
  id: string;
  account_id: string;
  /** Positive for a grant, negative for consumption/expiry/revocation. */
  amount: number;
  kind: "grant" | "consumption" | "expiry" | "revocation";
  reason: string;
  granted_by?: string;
  expires_at?: string;
  created_at: string;
}
