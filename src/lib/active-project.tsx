"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { activeProject as activeProjectHeader } from "./api/client";
import { keys as queryKeys, useProjects } from "./api/hooks";
import type { Project } from "./api/types";

// Exported so the root page can read the last-active project directly, for
// a synchronous redirect straight to its dashboard — bypassing this file's
// own React-Query-backed hook, which needs the project list to have loaded
// first.
export const ACTIVE_PROJECT_KEY = "teepin-active-project";

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
    // Mirrored into the API client so every project-scoped request (the
    // X-Project-ID header — see client.ts) picks up the change immediately,
    // with no separate "provision a credential for this project" step.
    activeProjectHeader.set(id);
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
 * Everything under GPU/CPU compute is project-scoped, and billing is per
 * project, so the console must always know which one it is spending in.
 *
 * Compute requests authenticate with the signed-in user's own JWT, plus an
 * X-Project-ID header naming this project — verified server-side against
 * the caller's account (pkg/auth/middleware.go). This mirrors how the AWS
 * console reaches its own APIs: your sign-in credential works directly,
 * scoped to whatever you're viewing. There is no separate project API key
 * for the console to provision or manage. A real API key (`tpk_...`),
 * created explicitly in Settings → API keys, is for the customer's own
 * CLI/CI use — a wholly different, opt-in credential.
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

    // Drop cached compute data — without this the new project renders the
    // old project's instances until the refetch lands, which is brief but
    // genuinely misleading.
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
