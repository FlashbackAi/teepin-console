"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { tokens } from "@/lib/api/client";

/**
 * Root: send the customer wherever they belong.
 *
 * Compute is the landing page for a signed-in customer — it is what they
 * came to look at, and a separate dashboard that only summarises it
 * would be a click in the way.
 */
export default function Root() {
  const router = useRouter();

  useEffect(() => {
    router.replace(tokens.access ? "/compute" : "/login");
  }, [router]);

  return null;
}
