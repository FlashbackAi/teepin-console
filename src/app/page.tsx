"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { tokens } from "@/lib/api/client";

/**
 * Root: send the customer wherever they belong.
 *
 * Home (/home) is the landing page for a signed-in customer — it is not
 * keyed by project ID, so this redirect needs nothing but the token check:
 * Home itself resolves whichever project the switcher currently has
 * active. No API call happens here, which also means a stale or slow
 * request can never surface an error on this page — see AuthGuard for the
 * one place a 401 is ever acted on.
 */
export default function Root() {
  const router = useRouter();

  useEffect(() => {
    router.replace(tokens.access ? "/home" : "/login");
  }, [router]);

  return null;
}
