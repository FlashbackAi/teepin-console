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
  /**
   * Whether this project's workloads may use on-demand (home-node)
   * capacity, as opposed to reserved (datacenter) capacity only. Today
   * every CPU instance IS home compute (see create-cpu-dialog.tsx), so
   * turning this off blocks CPU instance creation and Kumbha deploys
   * entirely until reserved capacity exists.
   */
  allow_on_demand: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateProjectRequest {
  /** Omitted fields are left unchanged — not cleared. */
  name?: string;
  description?: string;
  environment?: Environment | "";
  allow_on_demand?: boolean;
}

export interface APIKey {
  id: string;
  project_id: string;
  name: string;
  key_prefix: string;
  /** Permissions: e.g. instances:read, instances:write, inference:invoke. */
  scopes?: string[];
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
export type InstanceStatus = "pending" | "running" | "failed" | "terminated";

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
  /** Persistent volume size in GB; 0/absent means no volume — the
   *  instance stays ephemeral. */
  storage_gb?: number;
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
  /** "home" opts the workload onto a consumer CPU node. Omit for the
   *  default datacenter/GPU path. */
  node_class?: "home";
  /** Constrain a home workload to a CPU architecture ("amd64"/"arm64"). */
  arch?: string;
  command?: string[];
  args?: string[];
  env?: Record<string, string>;
  ports?: { container: number }[];
  labels?: Record<string, string>;
  /** Provisions a persistent volume mounted at /data, billed by GB-month.
   *  Omit or 0 for an ephemeral instance. On a home node the volume is
   *  node-local — it does not survive that node going offline. */
  storage_gb?: number;
  /** Optional, explicit P-core/E-core preference for a home-node instance.
   *  Omit both for no preference — the platform either bills via
   *  cpu_units alone (a node with no detected split) or picks a
   *  proportional default. Ignored on the GPU/datacenter path. */
  p_cores?: number;
  e_cores?: number;
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

/** One compute.instance_metrics row — a single utilization reading. What
 *  GET /v1/compute/instances/:id/metrics returns, oldest first.
 *  cpu_used_percent is relative to the instance's OWN allocation
 *  (cpu_units), not host capacity — "am I using what I'm paying for".
 *  storage_used_gb is a SNAPSHOT of ephemeral storage usage, not a
 *  throughput rate (there is no per-pod disk I/O rate source yet). */
export interface InstanceMetricSample {
  recorded_at: string;
  cpu_used_percent: number;
  memory_used_gb: number;
  network_rx_mbps: number;
  network_tx_mbps: number;
  storage_used_gb: number;
}

export interface InstanceMetrics {
  instance_id: string;
  samples: InstanceMetricSample[];
}

/** A short-lived, single-use credential for the terminal WebSocket
 *  attach step — see createExecSession in client.ts. */
export interface ExecTicket {
  ticket_id: string;
  ticket_secret: string;
  attach_path: string;
  expires_in: number;
}

export interface ImagePort {
  port: number;
  protocol: string;
}

export interface ImagePortsResponse {
  ports: ImagePort[];
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
  "draft" | "open" | "paid" | "void" | "uncollectible";

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

/** Operator-only view of an invoice's charge progress. Fetched separately
 *  from the invoice body (admin GET /invoices/:id/charge-state) so a
 *  customer's invoice never carries these retry internals. */
export interface InvoiceChargeState {
  /** How many times the invoice has been charged (0 = never attempted). */
  charge_attempts: number;
  last_charge_attempt_at?: string;
  /** Reason the last charge attempt failed (Stripe decline / "no card"). */
  last_charge_error?: string;
  /** The PaymentIntent we started for this invoice, if any. */
  stripe_payment_intent_id?: string;
}

/** Platform pricing. GPU is billed on VRAM; home CPU on cores + memory
 *  (both default 0 until an operator sets a rate). */
export interface Pricing {
  vram_price_per_gb_hour: number;
  cpu_price_per_core_hour: number;
  memory_price_per_gb_hour: number;
  /** GB-MONTH rate, unlike every other field here (per-hour) — the
   *  collector converts it internally. */
  storage_price_per_gb_month: number;
  /** Kumbha Gateway rates, per MILLION tokens — priced separately for
   *  input/output since the two cost very differently on every backend
   *  the gateway routes to. */
  llm_price_per_million_input: number;
  llm_price_per_million_output: number;
  /** P-core/E-core rates for a home-node instance placed with a detected
   *  split — cpu_price_per_core_hour above remains the rate for an
   *  instance with no detected split. Additive, not a replacement. */
  p_core_price_per_hour: number;
  e_core_price_per_hour: number;
  updated_by?: string;
  updated_at?: string;
}

/** Teepin Inference's model catalog entry. model_route is the key callers
 *  address ("teepin/qwen3-omni-7b", "anthropic/claude-sonnet-5"), not the
 *  backend's own model id. Distinct from Pricing's llm_price_per_million_*
 *  fields — those are one flat rate built for Kumbha's own internal
 *  single-model gateway; a catalog entry here is priced per model, since
 *  a self-hosted model and a proxied frontier model cost very differently. */
export interface InferenceModel {
  model_route: string;
  display_name: string;
  cost_class: "own" | "frontier";
  engine: string;
  context_window: number;
  supports_tools: boolean;
  supports_vision: boolean;
  supports_audio: boolean;
  input_price_per_million: number;
  output_price_per_million: number;
  /** What the vendor actually charges Teepin, per million tokens — only
   *  meaningful for cost_class="frontier". Absent, not zero, when unknown. */
  vendor_input_cost_per_million?: number;
  vendor_output_cost_per_million?: number;
  /** Gates routing, not existence — a model can be catalogued before it's
   *  actually mountable, or retired without losing pricing/audit history. */
  enabled: boolean;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

/** One backend candidate configured to serve a Kumbha route, ranked
 *  against any others on the same route by priority (lower tried first).
 *  Live-editable from Control Center with no redeploy — see
 *  pkg/kumbha/candidates.go. api_key is deliberately absent from this
 *  type: it is write-only (KumbhaCandidateInput.api_key), stored in AWS
 *  Secrets Manager, and never read back — has_secret is the only signal
 *  the console ever gets that one is set. */
export interface KumbhaCandidateView {
  id: string;
  priority: number;
  provider_type: "vllm" | "anthropic";
  base_url: string;
  model: string;
  context_window: number;
  supports_tools: boolean;
  max_output_tokens: number;
  enabled: boolean;
  has_secret: boolean;
  health: "unknown" | "healthy" | "unhealthy";
  health_error?: string;
  checked_at?: string;
}

/** What Control Center sends to create or update a candidate.
 *  route_name is required on create, ignored on update (a candidate's
 *  route is immutable once created — moving it is delete-then-create).
 *  api_key is write-only: on update, an empty/omitted value leaves
 *  whatever key is already stored untouched, so editing base_url doesn't
 *  require re-pasting the key every time. */
export interface KumbhaCandidateInput {
  route_name?: string;
  priority: number;
  provider_type: "vllm" | "anthropic";
  base_url: string;
  model: string;
  context_window: number;
  supports_tools: boolean;
  max_output_tokens: number;
  enabled: boolean;
  api_key?: string;
}

/** One Kumbha route as Control Center sees it — health/enabled at the
 *  route level (unchanged from before candidates existed) plus, on a
 *  deployment with candidates configured, the ranked list of backends
 *  actually serving it. candidates is absent on a route that still only
 *  has its static, env-var-configured backend. */
export interface KumbhaRouteView {
  name: string;
  enabled: boolean;
  health: "unknown" | "healthy" | "unhealthy";
  health_error?: string;
  checked_at?: string;
  candidates?: KumbhaCandidateView[];
}

/** The generic, Control-Center-driven mount/unmount primitive — an
 *  inference model server today, a teepin-agent binary update planned to
 *  reuse this same shape later (kind="agent_binary"). config is opaque
 *  JSON, kind-specific; for kind="inference_model" it holds
 *  {model_route, engine, model_source, storage_gb, cpu_units, memory_gb,
 *  gpu_count, backend_model?, max_concurrency?} — NOT a base_url: the
 *  reachable address is observed_endpoint below, resolved by the
 *  reconciler after the instance actually starts, never operator-typed. */
export interface NodeServiceRecord {
  id: string;
  node_id: string;
  kind: "inference_model" | "agent_binary";
  config: Record<string, unknown>;
  desired_state: "mounted" | "unmounted";
  observed_state: "pending" | "mounted" | "unmounted" | "error";
  observed_error?: string;
  observed_endpoint?: string;
  observed_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** A persisted compute node (home-compute pilot). Consumer-grade capacity
 *  and the datacenter GPU fleet both appear here, distinguished by `class`. */
export interface Node {
  id: string;
  node_name: string;
  provider_id: string;
  /** "datacenter" (GPU fleet) or "home" (consumer-grade CPU capacity). */
  class: "datacenter" | "home";
  region?: string;
  cpu_cores?: number;
  memory_gb?: number;
  /** Physical-core P-core/E-core split for a hybrid consumer CPU, detected
   *  by cmd/teepin-hostprobe (Windows/macOS) or natively (bare-metal
   *  Linux). Both absent/0 means no split was detected — a homogeneous
   *  CPU, an agent predating this feature, or a hypervisor that does not
   *  expose real core-type info to its guest. */
  p_cores?: number;
  e_cores?: number;
  /** A consumer GPU is recorded as an attribute, never as sellable VRAM. */
  gpu_model?: string;
  gpu_count: number;
  mig_capable: boolean;
  os?: string;
  arch?: string;
  agent_version?: string;
  /** Operator-provided, set any time after enrollment in Control Centre —
   *  never derived from IP geolocation. Absent until an operator sets it;
   *  purely informational (a map pin), no effect on placement or billing. */
  latitude?: number;
  longitude?: number;
  location_label?: string;
  /** enrolled | online | offline | disabled. */
  status: "enrolled" | "online" | "offline" | "disabled";
  last_seen_at?: string;
  revoked_at?: string;
  /** How much of the detected specs the operator offers for rent (0 until
   *  a reservation is set). Detected cpu_cores/memory_gb are the ceiling. */
  rentable_cpu_cores: number;
  rentable_memory_gb: number;
  /** Whether this node's own Kubernetes was reachable as of its last
   *  report (refreshed ~30s). Distinct from `status`: a node can be
   *  "online" (its agent is connected) while this is false (its local
   *  k3s — e.g. crashed — cannot schedule pods). Placement excludes such
   *  a node the same as an offline one. */
  k8s_ready: boolean;
  created_at: string;
  updated_at: string;
}

/** One compute.node_metrics row — a single utilization reading. What
 *  GET /v1/admin/nodes/:id/metrics returns, oldest first. All fields are
 *  point-in-time CURRENT USE, not the static capacity already on `Node`
 *  (cpu_cores/memory_gb) — a zero reading is indistinguishable from
 *  "genuinely idle"; key off recorded_at to tell "no data yet" apart from
 *  that. gpu_used_vram_gb is 0 for a CPU-only home node's samples. */
export interface NodeMetricSample {
  recorded_at: string;
  cpu_used_percent: number;
  memory_used_gb: number;
  gpu_used_vram_gb: number;
  network_rx_mbps: number;
  network_tx_mbps: number;
  storage_read_mbps: number;
  storage_write_mbps: number;
}

/** Per-node capacity breakdown (control centre). Used is derived from running
 *  instances; free = rentable - used, clamped at 0. */
export interface NodeCapacity {
  node_id: string;
  node_name: string;
  class: "datacenter" | "home";
  status: string;
  detected_cpu_cores: number;
  detected_memory_gb: number;
  rentable_cpu_cores: number;
  rentable_memory_gb: number;
  used_cpu_cores: number;
  used_memory_gb: number;
  free_cpu_cores: number;
  free_memory_gb: number;
}

/** A CPU instance tier with a "fits right now" flag, for the create dialog. */
export interface TierFit {
  id: string;
  name: string;
  cpu_units: number;
  memory_gb: number;
  price_per_hour: number;
  fits: boolean;
}

/** Customer-facing home capacity summary: tiers + fitment + free totals. */
export interface HomeCapacity {
  tiers: TierFit[];
  total_free_cpu_cores: number;
  total_free_memory_gb: number;
  max_free_cpu_cores: number;
  max_free_memory_gb: number;
  // Live per-resource rates — the exact formula each tier above is priced
  // with (cpu_units*cpu_core_rate + memory_gb*memory_gb_rate). Lets a
  // free-form vCPU/memory entry quote itself the same way, live, without a
  // round trip per keystroke.
  cpu_core_rate_per_hour: number;
  memory_gb_rate_per_hour: number;
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

// ---------------------------------------------------------------------
// Kumbha — the autonomous build service
//
// Kumbha itself has no console page of its own (KUMBHA-DESIGN.md): what
// lives under /build is the agent-flow UI, and every teepin.* call the
// agent makes is the SAME real customer-facing API a human uses from
// elsewhere in this console (compute, billing) — see the CloudFormation
// parallel in the design doc. Nothing here is a "Kumbha resource"; it's
// ordinary account resources, created on the customer's behalf.
// ---------------------------------------------------------------------

/**
 * A build session's lifecycle.
 *
 * `open` is the only state a build is actually running in. The other
 * three are all terminal — the split exists (rather than one generic
 * "closed") so the console can say WHY a build stopped: the customer
 * closed it, it ran out of pre-approved budget, or it sat idle too long.
 */
export type KumbhaSessionStatus =
  "open" | "closed" | "budget_exhausted" | "idle_timeout";

export interface KumbhaSession {
  id: string;
  /** Dollars pre-authorised for this session's own reasoning (the agent's
   *  token spend) — NOT the cost of any infrastructure it creates, which
   *  bills separately through the ordinary compute/storage dimensions
   *  once the customer approves the deployment plan. */
  budget: number;
  spent: number;
  status: KumbhaSessionStatus;
  label: string;
  /** The pre-deploy cost-approval gate (KUMBHA-DESIGN.md) — until this is
   *  true, the agent's create_instance/deploy/attach_domain tools are
   *  hard-blocked server-side, not just prompted to wait. */
  deploy_approved: boolean;
  /** Whether the agent pod is currently running. The pod itself (Kumbha's
   *  own workload, not a resource the customer manages — see
   *  pkg/kumbha/agent.go) is deliberately never exposed by ID here. On
   *  GetKumbhaSession AND ListKumbhaSessions (both share
   *  enrichKumbhaAgentRunning — cheap enough, an in-memory cache lookup
   *  in this platform's actual topology, to run on every row) this is a
   *  LIVE cluster read; on create it is the cheaper "was a pod ever
   *  launched" proxy — see the backend's own kumbhaSessionResponse
   *  comment for why that split exists. Found live 2026-08-29: the cheap
   *  proxy alone left the "Previous builds" list showing an animated
   *  "Building" status for a session whose agent had long since
   *  finished. */
  agent_running: boolean;
  /** The real compute instance this session's deploy(s) produced — a
   *  normal, customer-manageable instance (/compute/{id}), unlike the
   *  agent pod. Empty until the first successful deploy; unchanged by
   *  every deploy after that (a redeploy swaps this instance's own pod
   *  in place rather than creating a new one). */
  app_instance_id: string;
  /** The deployed app's own live status — compute's own InstanceStatus
   *  vocabulary (see status.tsx's StatusPill, reused as-is for this), so
   *  the console never invents a second status taxonomy for the same
   *  underlying pod. Present ONLY on GetKumbhaSession (see
   *  enrichKumbhaAppStatus's own doc comment on why ListKumbhaSessions
   *  deliberately does not pay this one's live-read cost per row), and
   *  only once app_instance_id is set. This is what actually answers
   *  "did the last deploy work" — agent_running alone cannot, since the
   *  agent can finish while the app it deployed is crash-looping. */
  app_status?: InstanceStatus;
  app_status_message?: string;
  /** The deployed app's live URL, straight from the same cluster read as
   *  app_status — the authoritative source for the Preview tab and the
   *  "open instance" link, since it works whether the last deploy was
   *  the agent's own `deploy` call or the console IDE's Deploy button,
   *  and survives a page reload unlike an event-parsed URL. GetKumbhaSession
   *  only, same as app_status. */
  app_endpoint?: string;
  /** Whether the session's MOST RECENT build/deploy attempt failed — a
   *  stored column (see migration 030), not a live read, so it is cheap
   *  enough for the "Previous builds" list too, unlike app_status. Can be
   *  true while app_instance_id still names a perfectly healthy,
   *  currently-running instance: the latest attempt failing does not
   *  touch whatever an earlier successful deploy already has running —
   *  this only means "your last action here didn't work", not "nothing
   *  is running". Cleared (false) the next time a build/deploy succeeds. */
  last_deploy_failed: boolean;
  last_deploy_error: string;
  started_at: string;
  ended_at?: string | null;
}

/**
 * One compute instance a Kumbha session has created — via deploy's own
 * bookkeeping (app_instance_id) or a raw create_instance call, which
 * historically left no trace on the session at all (found live
 * 2026-08-30/31: an agent working around a broken `deploy` endpoint fell
 * back to create_instance twice, producing one broken and one working
 * instance, NEITHER visible anywhere until the customer noticed the
 * extra bill). is_app marks the one instance the session's own
 * app_instance_id names — everything else is a byproduct (a failed
 * attempt, a sidecar) worth surfacing so it can be deleted rather than
 * silently billing forever. Status/endpoint are the last value the
 * reconciler stored, not a live read — same staleness bound as the
 * plain Compute page between reconciler ticks. */
export interface KumbhaSessionInstance {
  id: string;
  name: string;
  image: string;
  status: InstanceStatus;
  endpoint: string;
  is_app: boolean;
  created_at: string;
  terminated_at?: string | null;
}

/**
 * One line from the agent's own activity — what the console's live
 * feed renders. This is the ENTIRE customer-visible surface of what the
 * agent is doing; which model or provider served any given step is
 * structurally never present here (see pkg/kumbha/events.go's
 * allowlist-based sanitisation — not a client-side convention, a
 * server-enforced one).
 *
 * - `action`: the agent is doing something (running a command, editing a
 *   file, calling a teepin.* tool).
 * - `observation`: the result of the most recent action.
 * - `message`: the agent talking to the customer directly.
 * - `error`: something in the agent's own run failed.
 * - `idle`: the agent has nothing more to do right now and is waiting for
 *   the next instruction — a deliberate, distinct terminal marker, not
 *   silence the customer has to interpret themselves.
 */
export type KumbhaEventType =
  "action" | "observation" | "message" | "error" | "idle" | "tasks";

/** One item in task_tracker's list — mirrors the agent's own Task schema
 *  (openhands/tools/task_tracker: title/notes/status) exactly, since
 *  run.py forwards it as-is rather than re-summarizing it into prose. */
export interface KumbhaTask {
  title: string;
  notes: string;
  status: "todo" | "in_progress" | "done";
}

export interface KumbhaEvent {
  type: KumbhaEventType;
  /** The tool/command name, for action/observation events — e.g.
   *  "TerminalTool", "create_instance", "present_deployment_plan". */
  tool?: string;
  /** Human-readable text — for present_deployment_plan specifically, this
   *  is raw JSON (a DeploymentPlan) rather than prose; see
   *  parseDeploymentPlan below. */
  summary?: string;
  /** Only present on a "message" event — the SDK's own SourceType
   *  (event.source), forwarded as-is by run.py. Read this to tell a
   *  customer's own message from the agent's reply; never derive it by
   *  parsing `summary`'s text — that only ever worked by coincidence, via
   *  a debug-string prefix that vanished the moment summary stopped being
   *  the SDK's truncated str(event) (found live 2026-09-22: the switch to
   *  full untruncated text silently broke role detection, since the
   *  prefix was never a stable field). */
  role?: "user" | "agent" | "environment" | "hook";
  /** Observation.is_error, forwarded as-is — universal across every tool
   *  (see run.py's summarize_observation/on_event), so a failed tool call
   *  reads distinctly from a normal one instead of a uniform icon either
   *  way. Absent on non-observation events. */
  is_error?: boolean;
  /** A unified diff (old vs. new file content), only present on a
   *  file_editor observation that actually changed something — see
   *  run.py's diff_lines. Pre-computed server-side (Python's difflib) so
   *  the console only needs to color +/- lines, not compute the diff. */
  diff?: string;
  /** A MessageEvent's extended-thinking text, if the model produced any
   *  this turn (run.py's summarize_reasoning) — absent, not empty string,
   *  when there was none. */
  reasoning?: string;
  /** Only present on a "tasks" event — task_tracker's full current list,
   *  replacing whatever was shown before (not a delta/append). */
  tasks?: KumbhaTask[];
  /** Unix timestamp in seconds (Python's time.time()), not milliseconds —
   *  multiply by 1000 before handing to `Date`. */
  ts: number;
}

export interface DeploymentPlanResource {
  name: string;
  cpu_units: number;
  memory_gb: number;
  storage_gb: number;
  cost_per_hour: number;
  cost_per_month: number;
}

/** The itemised infrastructure estimate the customer approves before any
 *  real resource is created — see the "Pre-deploy cost approval" gate.
 *  Arrives as an `observation` event's `summary` field (JSON text, not
 *  prose) from the present_deployment_plan tool. */
export interface DeploymentPlan {
  resources: DeploymentPlanResource[];
  total_cost_per_hour: number;
  total_cost_per_month: number;
}

/** Attempts to read an observation event's summary as a DeploymentPlan.
 *  Returns null for anything else (an ordinary text summary, malformed
 *  JSON) rather than throwing — most observations are plain prose, and
 *  that is the expected, common case here, not an error. */
export function parseDeploymentPlan(event: KumbhaEvent): DeploymentPlan | null {
  if (
    event.type !== "observation" ||
    event.tool !== "present_deployment_plan"
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(event.summary ?? "");
    if (Array.isArray(parsed?.resources)) return parsed as DeploymentPlan;
  } catch {
    /* not JSON — not a deployment plan */
  }
  return null;
}

/**
 * One file in a session's workspace — what the agent's file_editor tool
 * wrote, uploaded automatically (see run.py's upload_workspace), or what
 * the customer edited directly in the console IDE and saved.
 */
export interface KumbhaWorkspaceFile {
  path: string;
  content: string;
}

/** A file the agent deliberately did not upload (binary, too large) —
 *  surfaced so the file tree can say what's missing rather than silently
 *  omitting it. */
export interface KumbhaSkippedFile {
  path: string;
  reason: string;
}

/** Who produced a workspace version — an automatic agent save after a
 *  file_editor call, or an explicit customer edit-and-save in the IDE.
 *  Shown in the history list, since the two read very differently when
 *  picking a rollback target. */
export type KumbhaWorkspaceCreatedBy = "agent" | "customer";

/**
 * One version's full content — what the file browser and ZIP download
 * read. Versioned, not overwrite-in-place: every save (agent or
 * customer) is a new version, and `current_workspace_version` on the
 * session says which one is live. See migration 025 and
 * pkg/kumbha/workspace.go for the storage shape this mirrors.
 */
export interface KumbhaWorkspace {
  version: number;
  files: KumbhaWorkspaceFile[];
  skipped: KumbhaSkippedFile[];
  file_count: number;
  byte_size: number;
  created_by: KumbhaWorkspaceCreatedBy;
  created_at: string;
  /** True when this version is worth showing in the "Version history"
   *  list — true once a deploy has checkpointed it, OR immediately for a
   *  customer's own edit-and-save (so it shows up right away, without
   *  waiting for a redeploy). Does NOT mean this content is currently
   *  running — see is_deployed below. Conflating the two broke live
   *  2026-08-31: a customer edited and saved, and the Deploy button
   *  immediately disabled itself with "Already deployed" for a version
   *  that had never been deployed. */
  is_checkpoint: boolean;
  /** True when THIS version is byte-for-byte what the last successful
   *  deploy actually built and ran. This, not is_checkpoint, is what the
   *  code panel's Deploy button reads to disable itself — rebuilding and
   *  redeploying something that isn't actually different is the no-op
   *  this guards against. */
  is_deployed: boolean;
}

/**
 * One entry in a session's version history — metadata only, no file
 * content, so listing history stays cheap regardless of version size.
 * `current` marks the version the session's pointer is on right now —
 * the one a rollback would be a no-op on.
 */
export interface KumbhaWorkspaceVersionInfo {
  version: number;
  file_count: number;
  byte_size: number;
  created_by: KumbhaWorkspaceCreatedBy;
  created_at: string;
  current: boolean;
  /** True when THIS version is what the last successful deploy actually
   *  built and ran — not the same as created_by === "agent" (found live
   *  2026-08-31: the history dialog used to label every agent row
   *  "Deployed" and every customer row "You", but a customer's saved,
   *  never-deployed edit had no way to be told apart from one that was
   *  later deployed). */
  is_deployed: boolean;
}

// ---------------------------------------------------------------------
// Teepin S3 (pkg/objectstore).
// ---------------------------------------------------------------------

/** A catalog construct only — never a real bucket on whatever backend is
 *  active. See pkg/objectstore's own doc comment for why. */
export interface Bucket {
  id: string;
  name: string;
  backend: string;
  object_count: number;
  total_bytes: number;
  created_at: string;
  updated_at: string;
}

export type StorageObjectStatus =
  "available" | "failed" | "deleted" | "missing" | "orphaned";

/** One object in a bucket. There is no `physical_key` here on purpose —
 *  the backend's internal addressing never reaches the API response, see
 *  pkg/models.StorageObject's own doc comment. */
export interface StorageObject {
  id: string;
  key: string;
  size_bytes: number;
  content_type?: string;
  metadata?: Record<string, string>;
  checksum_sha256?: string;
  status: StorageObjectStatus;
  backend: string;
  upload_error?: string;
  created_at: string;
  updated_at: string;
  uploaded_at?: string;
}

/** One model in the public Teepin Inference catalog (GET /v1/models). */
export interface PublicModel {
  id: string;
  display_name: string;
  context_window?: number;
  supports_tools: boolean;
  supports_vision: boolean;
  supports_audio: boolean;
  pricing: {
    input_per_million_tokens: number;
    output_per_million_tokens: number;
  };
}
