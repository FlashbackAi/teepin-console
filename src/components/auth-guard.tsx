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
  // open and comes back hits this routinely. Without it they sit on a
  // page where every panel shows an authentication error and nothing
  // suggests signing in again.
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

      tokens.clear();
      queryClient.clear();
      router.replace("/login");
    });
    return unsubscribe;
  }, [checked, queryClient, router]);

  if (!checked) return null;
  return <>{children}</>;
}
