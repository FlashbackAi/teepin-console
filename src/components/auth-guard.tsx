"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { tokens } from "@/lib/api/client";

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
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/login");
      return;
    }
    setChecked(true);
  }, [router]);

  if (!checked) return null;
  return <>{children}</>;
}
