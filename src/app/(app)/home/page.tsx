"use client";

import Link from "next/link";
import { Check, Settings } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Stat,
} from "@/components/ui/card";
import { EnvironmentBadge } from "@/components/ui/environment-badge";
import { Loading } from "@/components/ui/loading";
import {
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/table";
import { useActiveProject } from "@/lib/active-project";
import {
  useBillingSummary,
  useCreditBalance,
  useInstanceCountsByProject,
  useInstances,
} from "@/lib/api/hooks";
import { formatCost, fullTime, timeAgo } from "@/lib/utils";
import type { Project } from "@/lib/api/types";

// Both preview cards below cap what they show/fetch to this many rows —
// Home is a glance, not a second /projects or /billing page, and the
// projects preview fires one request per row (see
// useInstanceCountsByProject), so the cap also bounds how many requests
// a project-heavy account's Home page fires.
const PREVIEW_ROWS = 6;

/**
 * Home — the landing page after sign-in.
 *
 * Deliberately not project-specific by URL: there is no [id] segment, and
 * the breadcrumb never carries a project name. It always reflects whatever
 * project the switcher currently has active — the same project the
 * sidebar's own nav is scoped to — so switching projects updates this page
 * exactly like it updates everything else, with no separate per-project
 * dashboard URL to keep in sync. Project identity and settings live at
 * /projects/[id]/settings, one click away via the header action.
 */
export default function HomePage() {
  const { project, projects, select, isLoading } = useActiveProject();

  if (isLoading) {
    return (
      <>
        <PageHeader breadcrumb={["Home"]} />
        <Loading className="py-16" />
      </>
    );
  }

  if (projects.length === 0) {
    return (
      <>
        <PageHeader breadcrumb={["Home"]} />
        <div className="p-6">
          <Card>
            <EmptyState
              title="No projects yet"
              description="Projects scope instances, API keys and billing. Create one to get started."
              action={
                <Link href="/projects">
                  <Button variant="primary" size="sm">
                    Go to projects
                  </Button>
                </Link>
              }
            />
          </Card>
        </div>
      </>
    );
  }

  // Active project still resolving (useActiveProject sets it in an effect
  // once the project list has loaded) — a brief moment, not an error.
  if (!project) {
    return (
      <>
        <PageHeader breadcrumb={["Home"]} />
        <Loading className="py-16" />
      </>
    );
  }

  return (
    <Overview
      project={project}
      projects={projects}
      onSelectProject={select}
    />
  );
}

function Overview({
  project,
  projects,
  onSelectProject,
}: {
  project: Project;
  projects: Project[];
  onSelectProject: (id: string) => void;
}) {
  const instances = useInstances();
  const billing = useBillingSummary();
  const credit = useCreditBalance();

  const running = (instances.data?.instances ?? []).filter(
    (i) => i.status === "running",
  );
  const gpuRunning = running.filter((i) =>
    (i.instance_type ?? "").startsWith("gpu"),
  ).length;
  const cpuRunning = running.length - gpuRunning;

  // BillingSummary is account-wide, broken down per project — this
  // project's own line, not the account total (that belongs on /billing).
  const projectSpend = billing.data?.projects.find(
    (p) => p.project_id === project.id,
  );
  const hasCredit = (credit.data?.balance ?? 0) > 0;

  return (
    <>
      <PageHeader
        breadcrumb={["Home"]}
        action={
          <Link href={`/projects/${project.id}/settings`}>
            <Button variant="secondary" size="sm">
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                At a glance
                <span className="text-muted-foreground font-normal">
                  — {project.name}
                </span>
                <EnvironmentBadge project={project} />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <section className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              <Stat
                label="GPU instances running"
                value={instances.isLoading ? "—" : String(gpuRunning)}
              />
              <Stat
                label="CPU instances running"
                value={instances.isLoading ? "—" : String(cpuRunning)}
              />
              <Stat
                label="This project, this period"
                value={
                  billing.isLoading
                    ? "—"
                    : formatCost(projectSpend?.cost ?? 0)
                }
              />
              {hasCredit && (
                <Stat
                  label="Account credit remaining"
                  value={formatCost(credit.data!.balance)}
                  hint="Applied before your card is charged"
                />
              )}
            </section>
          </CardContent>
        </Card>

        <ProjectsPreview
          projects={projects}
          activeId={project.id}
          onSelect={onSelectProject}
        />

        <CostSnapshot billing={billing.data} isLoading={billing.isLoading} />
      </div>
    </>
  );
}

function ProjectsPreview({
  projects,
  activeId,
  onSelect,
}: {
  projects: Project[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const shown = projects.slice(0, PREVIEW_ROWS);
  const counts = useInstanceCountsByProject(shown.map((p) => p.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
      </CardHeader>
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Slug</TH>
            <TH>Created</TH>
            <TH className="text-right">Running</TH>
            <TH className="text-right">Action</TH>
          </TR>
        </THead>
        <TBody>
          {shown.map((project, i) => {
            const isActive = project.id === activeId;
            const result = counts[i];
            const runningCount = (result?.data?.instances ?? []).filter(
              (inst) => inst.status === "running",
            ).length;

            return (
              <TR key={project.id}>
                <TD>
                  <span className="inline-flex items-center gap-2 font-medium">
                    {project.name}
                    <EnvironmentBadge project={project} />
                  </span>
                </TD>
                <TD>
                  <span className="identifier text-muted-foreground">
                    {project.slug}
                  </span>
                </TD>
                <TD
                  className="text-muted-foreground"
                  title={fullTime(project.created_at)}
                >
                  {timeAgo(project.created_at)}
                </TD>
                <TD className="tabular text-right">
                  {result?.isLoading ? "—" : runningCount}
                </TD>
                <TD className="text-right">
                  {isActive ? (
                    <span className="text-muted-foreground inline-flex items-center justify-end gap-1 text-xs">
                      <Check className="h-3.5 w-3.5" />
                      Current
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onSelect(project.id)}
                    >
                      Switch to
                    </Button>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {projects.length > PREVIEW_ROWS && (
        <div className="hairline-t border-border p-3 text-center">
          <Link
            href="/projects"
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            View all {projects.length} projects →
          </Link>
        </div>
      )}
    </Card>
  );
}

function CostSnapshot({
  billing,
  isLoading,
}: {
  billing: ReturnType<typeof useBillingSummary>["data"];
  isLoading: boolean;
}) {
  const topProjects = [...(billing?.projects ?? [])]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, PREVIEW_ROWS);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            Cost snapshot
            <span className="text-muted-foreground font-normal">
              — this period
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loading className="py-8" />
        ) : !billing?.projects.length ? (
          <EmptyState
            title="No usage yet"
            description="Costs appear here once a project starts running something."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Stat
              label="Total spend, all projects"
              value={formatCost(billing.total_cost)}
            />
            <Table>
              <THead>
                <TR>
                  <TH>Project</TH>
                  <TH className="text-right">Cost</TH>
                </TR>
              </THead>
              <TBody>
                {topProjects.map((p) => (
                  <TR key={p.project_id}>
                    <TD className="font-medium">{p.project_name}</TD>
                    <TD className="tabular text-right">
                      {formatCost(p.cost)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </CardContent>
      <div className="hairline-t border-border p-3 text-center">
        <Link
          href="/billing"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          View billing →
        </Link>
      </div>
    </Card>
  );
}
