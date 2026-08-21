"use client";

import { AuthGuard } from "@/components/auth-guard";
import { Sidebar } from "@/components/shell/sidebar";
import { useAccount, useBillingSummary, useInstances } from "@/lib/api/hooks";
import { useActiveProject } from "@/lib/active-project";
import { formatCost } from "@/lib/utils";

/**
 * Authenticated app shell.
 *
 * The sidebar's inline context — instance count, month-to-date spend —
 * comes from live queries rather than being passed down from each page,
 * so it stays correct regardless of which screen the customer is on.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <Shell>{children}</Shell>
    </AuthGuard>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const account = useAccount();
  const billing = useBillingSummary();
  const { project, projects, select } = useActiveProject();
  // Compute requests are scoped by X-Project-ID (see active-project.tsx),
  // set the instant a project is selected — no credential to wait for.
  const instances = useInstances(Boolean(project));

  // Badge counts are RUNNING only (not pending/stopped) — the number next
  // to a compute link answers "how much am I running right now", so a
  // pending or terminated instance must not inflate it. Split by kind so
  // the GPU badge never counts a CPU instance and vice versa.
  const runningInstances = (instances.data?.instances ?? []).filter(
    (i) => i.status === "running",
  );
  const isGpu = (t?: string) => (t ?? "").startsWith("gpu");
  const gpuRunning = runningInstances.filter((i) => isGpu(i.instance_type))
    .length;
  const cpuRunning = runningInstances.filter((i) => !isGpu(i.instance_type))
    .length;

  return (
    <div className="flex">
      <Sidebar
        accountName={account.data?.display_name ?? "…"}
        accountNumber={account.data?.account_number ?? ""}
        projects={projects}
        activeProject={project}
        onSelectProject={select}
        gpuRunning={gpuRunning}
        cpuRunning={cpuRunning}
        monthToDate={
          billing.data ? formatCost(billing.data.total_cost) : undefined
        }
      />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
