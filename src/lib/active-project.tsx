"use client";

import { useEffect, useState } from "react";

import { tokens } from "./api/client";
import { useApiKeys, useCreateApiKey, useProjects } from "./api/hooks";
import type { Project } from "./api/types";

const ACTIVE_PROJECT_KEY = "teepin-active-project";

/**
 * The project the console is currently operating in.
 *
 * Everything under GPU compute is project-scoped, and billing is per
 * project, so the console must always know which one it is spending in.
 *
 * It also holds that project's API key. Compute endpoints authenticate
 * with a project API key (`tpk_...`) rather than the user's JWT — the
 * JWT identifies a person, the key identifies a project. The console
 * provisions one silently on first use so the customer never has to
 * think about it; keys they create explicitly in Settings are for their
 * own CLI and CI use.
 */
export function useActiveProject() {
  const projects = useProjects();
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!projects.data?.projects.length) return;

    const stored = localStorage.getItem(ACTIVE_PROJECT_KEY);
    const exists = projects.data.projects.some((p) => p.id === stored);

    // Fall back to the first project when the stored one was deleted, or
    // belongs to an account the user has since switched away from.
    const next = exists ? stored! : projects.data.projects[0].id;
    setProjectId(next);
    localStorage.setItem(ACTIVE_PROJECT_KEY, next);
  }, [projects.data]);

  const select = (id: string) => {
    setProjectId(id);
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    // The stored API key belongs to the previous project and would
    // silently read the wrong project's instances.
    tokens.setApiKey("");
  };

  const project: Project | undefined = projects.data?.projects.find(
    (p) => p.id === projectId,
  );

  return {
    project,
    projects: projects.data?.projects ?? [],
    isLoading: projects.isLoading,
    select,
  };
}

/**
 * Ensures a usable API key exists for the active project.
 *
 * Compute screens cannot call the API without one. Rather than making
 * the customer create a key before they can see their instances — which
 * is a confusing first-run experience — the console provisions one for
 * its own use on demand.
 */
export function useEnsureApiKey(projectId: string | undefined) {
  const keys = useApiKeys(projectId);
  const createKey = useCreateApiKey(projectId ?? "");
  const [ready, setReady] = useState(Boolean(tokens.apiKey));

  useEffect(() => {
    if (!projectId || ready || createKey.isPending) return;
    if (tokens.apiKey) {
      setReady(true);
      return;
    }
    // Wait for the list before creating, or a refresh would mint a new
    // console key on every page load.
    if (keys.isLoading) return;

    createKey.mutate(
      { name: "console" },
      {
        onSuccess: (result) => {
          tokens.setApiKey(result.key);
          setReady(true);
        },
      },
    );
  }, [projectId, ready, keys.isLoading, createKey]);

  return { ready, error: createKey.error };
}
