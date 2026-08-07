"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "@/lib/api/client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Created in state so the client is stable across re-renders but not
  // shared between users during SSR.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Instance state changes on its own — a pod pulls its image,
            // starts, crashes — so a customer watching a create expects
            // the page to keep up without a manual refresh.
            refetchOnWindowFocus: true,
            staleTime: 5_000,

            retry: (failureCount, error) => {
              // Never retry auth failures: the token is wrong and will
              // stay wrong. Retrying just delays the redirect to login.
              if (error instanceof ApiError && error.isUnauthorized) {
                return false;
              }
              // 503 means GPU capacity is briefly unreachable (an agent
              // reconnecting, a control-plane deploy). Worth retrying —
              // this is exactly the transient case.
              if (error instanceof ApiError && error.isCapacityUnavailable) {
                return failureCount < 3;
              }
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
