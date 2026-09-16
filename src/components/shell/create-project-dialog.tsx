"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { errorMessage, useCreateProject } from "@/lib/api/hooks";

/** Shared by the /projects page and the sidebar's project switcher — one
 *  place for the "New project" form so both stay in sync. */
export function CreateProjectDialog({ onClose }: { onClose: () => void }) {
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
