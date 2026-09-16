"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { EnvironmentBadge } from "@/components/ui/environment-badge";

import { CreateProjectDialog } from "@/components/shell/create-project-dialog";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectActionsMenu } from "@/components/shell/project-actions-menu";
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
                {projects.map((project) => {
                  const isActive = active?.id === project.id;
                  return (
                    <TR key={project.id}>
                      <TD>
                        {isActive && (
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
                        <ProjectActionsMenu
                          projectId={project.id}
                          isActive={isActive}
                          onSwitch={select}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {creating && <CreateProjectDialog onClose={() => setCreating(false)} />}
    </>
  );
}
