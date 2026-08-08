"use client";

import { AuthGuard } from "@/components/auth-guard";
import { Sidebar } from "@/components/shell/sidebar";
import { useAccount, useBillingSummary, useInstances } from "@/lib/api/hooks";
import { useActiveProject, useEnsureApiKey } from "@/lib/active-project";
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
  const { ready } = useEnsureApiKey(project?.id);
  // The sidebar's instance count needs the project API key too, so it
  // waits rather than firing an unauthenticated request on every page.
  const instances = useInstances(ready);

  const running = instances.data?.instances.filter(
    (i) => i.status === "running" || i.status === "pending",
  ).length;

  return (
    <div className="flex">
      <Sidebar
        accountName={account.data?.display_name ?? "…"}
        accountNumber={account.data?.account_number ?? ""}
        projects={projects}
        activeProject={project}
        onSelectProject={select}
        instanceCount={running}
        monthToDate={
          billing.data ? formatCost(billing.data.total_cost) : undefined
        }
      />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
