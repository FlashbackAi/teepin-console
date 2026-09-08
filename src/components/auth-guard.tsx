"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ApiError, tokens } from "@/lib/api/client";

/**
 * Gate for authenticated routes.
 *
 * Renders nothing until the token check completes. The alternative —
 * rendering the app and redirecting on failure — flashes account data at
 * a logged-out visitor for one frame, which is both a privacy leak and
 * looks broken.
 *
 * This is a client-side check only. It decides what to DISPLAY; the API
 * decides what is permitted. A user who edits localStorage gets a
 * console that renders and then 401s on every request, which is the
 * correct outcome.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/login");
      return;
    }
    setChecked(true);
  }, [router]);

  // Access tokens expire after 15 minutes, so a customer who leaves a tab
  // open and comes back would hit this routinely — except request() now
  // refreshes silently on a 401 before it ever reaches here (see
  // tryRefresh in lib/api/client.ts, added 2026-08-23: a refresh token
  // was minted and stored at login this whole time but nothing ever
  // redeemed it, so every 401 landed here instead). This handler is what
  // fires when the refresh token itself has also expired (7 days) or was
  // never obtained — a genuine sign-out, not routine.
  //
  // Gated on `checked` so it cannot fire during the login transition: an
  // in-flight query from a previous session would otherwise clear the
  // credentials that had just been established and bounce the customer
  // straight back to the login form they had successfully passed.
  useEffect(() => {
    if (!checked) return;

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      const error = event.query.state.error;
      if (!(error instanceof ApiError) || !error.isUnauthorized) return;

      // Only act while a token is actually present. Without this a
      // stale error replayed after sign-out triggers a second redirect.
      if (!tokens.access) return;

      // Defer to a microtask: the cache can emit synchronously WHILE a
      // component is rendering (a query that errors during its first
      // render), and clearing state + navigating inline would be a
      // setState/navigation during render — which React rejects with
      // "Cannot update a component while rendering a different one".
      // queueMicrotask runs it immediately after the current render
      // settles, off React's synchronous path.
      queueMicrotask(() => {
        if (!tokens.access) return; // re-check: a concurrent sign-in may have set one
        tokens.clear();
        queryClient.clear();
        router.replace("/login");
      });
    });
    return unsubscribe;
  }, [checked, queryClient, router]);

  if (!checked) return null;
  return <>{children}</>;
}
