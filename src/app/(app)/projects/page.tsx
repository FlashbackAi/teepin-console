"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Settings } from "lucide-react";

import { EnvironmentBadge } from "@/components/ui/environment-badge";

import { CreateProjectDialog } from "@/components/shell/create-project-dialog";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { fullTime, timeAgo } from "@/lib/utils";

export default function ProjectsPage() {
  const { projects, project: active, select, isLoading } = useActiveProject();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        breadcrumb={["Projects"]}
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreating(true)}
          >
            Create project
          </Button>
        }
      />

      <div className="p-6">
        <Card>
          {isLoading ? (
            <Loading className="px-4 py-16" />
          ) : projects.length === 0 ? (
            <EmptyState
              title="No projects"
              description="Projects scope instances, API keys and billing. Most accounts start with one per environment."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCreating(true)}
                >
                  Create project
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-8" />
                  <TH>Name</TH>
                  <TH>Slug</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {projects.map((project) => (
                  // The whole row selects the project. A dedicated
                  // "Switch to" button made the common action the
                  // smallest target on the row.
                  <TR
                    key={project.id}
                    onClick={() => select(project.id)}
                    className="cursor-pointer"
                  >
                    <TD>
                      {active?.id === project.id && (
                        <Check className="text-foreground h-3.5 w-3.5" />
                      )}
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-2">
                        <span className="font-medium">{project.name}</span>
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
                    <TD className="text-right">
                      <Link
                        href={`/projects/${project.id}/settings`}
                        // Without this the row's own click handler also
                        // fires and switches projects on the way to
                        // settings — surprising, and easy to miss.
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`${project.name} settings`}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-7 w-7 items-center justify-center rounded"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {creating && <CreateProjectDialog onClose={() => setCreating(false)} />}
    </>
  );
}
