"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
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
import { errorMessage, useCreateProject } from "@/lib/api/hooks";
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
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              Loading…
            </div>
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
                  <TR key={project.id}>
                    <TD>
                      {active?.id === project.id && (
                        <Check className="text-foreground h-3.5 w-3.5" />
                      )}
                    </TD>
                    <TD className="font-medium">{project.name}</TD>
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
                      {active?.id !== project.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => select(project.id)}
                        >
                          Switch to
                        </Button>
                      )}
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

function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateProject();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Dialog
      title="Create project"
      description="Projects scope instances, API keys and billing."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            form="create-project"
            type="submit"
            disabled={create.isPending}
          >
            {create.isPending ? "Creating…" : "Create project"}
          </Button>
        </>
      }
    >
      <form
        id="create-project"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ name, description }, { onSuccess: onClose });
        }}
        className="flex flex-col gap-4"
      >
        <Field
          label="Name"
          hint="Must be unique within your account."
          htmlFor="project-name"
        >
          <Input
            id="project-name"
            required
            placeholder="production"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Description" htmlFor="project-description">
          <Input
            id="project-description"
            placeholder="Optional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {create.isError && (
          <p className="text-destructive text-xs">
            {errorMessage(create.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}
