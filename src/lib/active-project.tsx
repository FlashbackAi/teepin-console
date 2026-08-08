"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { tokens } from "./api/client";
import { keys as queryKeys, useApiKeys, useCreateApiKey, useProjects } from "./api/hooks";
import type { Project } from "./api/types";

const ACTIVE_PROJECT_KEY = "teepin-active-project";

/**
 * The selected project ID, shared across every component.
 *
 * A plain useState inside the hook gives each caller its OWN copy: the
 * sidebar's switcher would update the sidebar and nothing else, leaving
 * the page and breadcrumb showing the previous project. Since the
 * instance list is filtered by project, that means showing one project's
 * name above another project's data — which is exactly the confusion the
 * switcher exists to prevent.
 *
 * A module-level store with useSyncExternalStore keeps every subscriber
 * in step without pulling in a state library for one value.
 */
const projectStore = {
  current: null as string | null,
  listeners: new Set<() => void>(),

  subscribe(listener: () => void) {
    projectStore.listeners.add(listener);
    return () => projectStore.listeners.delete(listener);
  },

  get() {
    return projectStore.current;
  },

  set(id: string | null) {
    if (projectStore.current === id) return;
    projectStore.current = id;
    projectStore.listeners.forEach((listener) => listener());
  },
};

/** Server snapshot: no project is selected during SSR. */
const serverSnapshot = () => null;

/**
 * Forget the selected project.
 *
 * Called on sign-out: the store is module-level and survives navigation,
 * so without this the next account to sign in on this machine starts
 * pinned to a project ID they do not own — every project-scoped query
 * then 404s with no obvious cause.
 */
export function clearActiveProject() {
  projectStore.set(null);
}

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
  const queryClient = useQueryClient();
  const projects = useProjects();
  const projectId = useSyncExternalStore(
    projectStore.subscribe,
    projectStore.get,
    serverSnapshot,
  );

  useEffect(() => {
    if (!projects.data?.projects.length) return;
    // Already resolved — do not fight the customer's selection.
    if (projectStore.get()) return;

    const stored = localStorage.getItem(ACTIVE_PROJECT_KEY);
    const exists = projects.data.projects.some((p) => p.id === stored);

    // Fall back to the first project when the stored one was deleted, or
    // belongs to an account the user has since switched away from.
    const next = exists ? stored! : projects.data.projects[0].id;
    projectStore.set(next);
    localStorage.setItem(ACTIVE_PROJECT_KEY, next);
  }, [projects.data]);

  const select = (id: string) => {
    if (id === projectStore.get()) return;

    projectStore.set(id);
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);

    // The stored API key belongs to the PREVIOUS project. Left in place
    // it would keep reading that project's instances under the new
    // project's name — a cross-project data leak in the UI, even though
    // the API scoped every response correctly.
    tokens.clearApiKey();

    // Drop cached compute data for the same reason: without this the new
    // project renders the old project's instances until the refetch
    // lands, which is brief but genuinely misleading.
    queryClient.removeQueries({ queryKey: queryKeys.instances });
    queryClient.removeQueries({ queryKey: queryKeys.instanceTypes });
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
  const [readyFor, setReadyFor] = useState<string | null>(
    tokens.apiKey && projectId ? projectId : null,
  );

  // Tracked per project, not as a bare boolean: after switching projects
  // the previous project's key has been cleared, and a `ready` that
  // stayed true would let compute queries fire with no credentials.
  const ready = Boolean(projectId) && readyFor === projectId;

  useEffect(() => {
    if (!projectId || ready || createKey.isPending) return;

    if (tokens.apiKey) {
      setReadyFor(projectId);
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
          setReadyFor(projectId);
        },
      },
    );
  }, [projectId, ready, keys.isLoading, createKey]);

  return { ready, error: createKey.error };
}
