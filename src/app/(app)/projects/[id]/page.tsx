"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EnvironmentBadge } from "@/components/ui/environment-badge";
import { Field, Input, Select } from "@/components/ui/input";
import { clearActiveProject, useActiveProject } from "@/lib/active-project";
import {
  errorMessage,
  useDeleteProject,
  useUpdateProject,
} from "@/lib/api/hooks";
import { fullTime } from "@/lib/utils";
import type { Environment, Project } from "@/lib/api/types";

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { projects, isLoading } = useActiveProject();

  const project = projects.find((p) => p.id === id);

  if (isLoading) {
    return (
      <>
        <PageHeader breadcrumb={["Projects", "…"]} />
        <div className="text-muted-foreground p-6 text-sm">Loading…</div>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <PageHeader breadcrumb={["Projects", "Not found"]} />
        <div className="text-muted-foreground p-6 text-sm">
          This project does not exist, or belongs to another account.
        </div>
      </>
    );
  }

  return <Settings project={project} />;
}

function Settings({ project }: { project: Project }) {
  const update = useUpdateProject(project.id);

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [environment, setEnvironment] = useState<Environment | "">(
    project.environment ?? "",
  );
  const [deleting, setDeleting] = useState(false);

  // Re-sync when the underlying project changes (a save, or switching to
  // a different project's settings) so the form never shows stale values.
  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
    setEnvironment(project.environment ?? "");
  }, [project.id, project.name, project.description, project.environment]);

  const dirty =
    name !== project.name ||
    description !== (project.description ?? "") ||
    environment !== (project.environment ?? "");

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    // Send only what changed: the API treats an omitted field as "leave
    // unchanged", so sending everything would make a rename and a
    // description edit indistinguishable in the audit trail.
    update.mutate({
      ...(name !== project.name ? { name } : {}),
      ...(description !== (project.description ?? "") ? { description } : {}),
      ...(environment !== (project.environment ?? "") ? { environment } : {}),
    });
  };

  return (
    <>
      <PageHeader breadcrumb={["Projects", project.name, "Settings"]} />

      <div className="flex max-w-2xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                {project.name}
                <EnvironmentBadge project={project} />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="flex flex-col gap-4">
              <Field
                label="Project name"
                hint="Must be unique within your account."
                error={
                  update.isError ? errorMessage(update.error) : undefined
                }
                htmlFor="name"
              >
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>

              <Field label="Description" htmlFor="description">
                <Input
                  id="description"
                  placeholder="Optional"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>

              <Field
                label="Environment"
                hint="Shown as a badge everywhere this project appears."
                htmlFor="environment"
              >
                <Select
                  id="environment"
                  value={environment}
                  onChange={(e) =>
                    setEnvironment(e.target.value as Environment | "")
                  }
                >
                  <option value="">None</option>
                  <option value="dev">Development</option>
                  <option value="staging">Staging</option>
                  <option value="prod">Production</option>
                </Select>
              </Field>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!dirty || update.isPending}
                >
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
                {update.isSuccess && !dirty && (
                  <span className="text-muted-foreground text-xs">Saved.</span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4">
            <Detail label="Project ID">
              <span className="identifier">{project.id}</span>
            </Detail>
            <Detail label="Slug">
              <span className="identifier">{project.slug}</span>
            </Detail>
            <Detail label="Created">{fullTime(project.created_at)}</Detail>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Spend and instance-failure alerts are not available yet. They
              will be configured here alongside billing budgets.
            </p>
          </CardContent>
        </Card>

        {/* Destructive actions live in their own bordered section at the
            bottom, so they cannot be reached while scanning for
            something else. */}
        <Card className="border-destructive/40">
          <CardHeader className="border-destructive/40">
            <CardTitle className="text-destructive">Danger zone</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              Deleting a project revokes its API keys. Running instances must
              be terminated first — deleting a project never destroys running
              workloads.
            </p>
            <div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleting(true)}
              >
                Delete project
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {deleting && (
        <DeleteDialog project={project} onClose={() => setDeleting(false)} />
      )}
    </>
  );
}

function DeleteDialog({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const router = useRouter();
  const remove = useDeleteProject();
  const [typed, setTyped] = useState("");

  // Typing the name is the confirmation. A plain "are you sure" is
  // clicked reflexively; reproducing the name forces the customer to
  // look at WHICH project they are deleting.
  const confirmed = typed === project.name;

  return (
    <Dialog
      title="Delete project"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!confirmed || remove.isPending}
            onClick={() =>
              remove.mutate(project.id, {
                onSuccess: () => {
                  // The deleted project may be the selected one; leaving
                  // it selected would point every project-scoped query at
                  // something that no longer exists.
                  clearActiveProject();
                  onClose();
                  router.push("/projects");
                },
              })
            }
          >
            {remove.isPending ? "Deleting…" : "Delete project"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          This revokes every API key in{" "}
          <span className="text-foreground">{project.name}</span> and removes
          it from your account. Billing history is retained.
        </p>

        <Field
          label={`Type "${project.name}" to confirm`}
          error={remove.isError ? errorMessage(remove.error) : undefined}
          htmlFor="confirm"
        >
          <Input
            id="confirm"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-foreground text-sm">{children}</span>
    </div>
  );
}
