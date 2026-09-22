"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Wordmark } from "@/components/ui/wordmark";
import { PublicGlobe } from "@/components/public-globe";
import { errorMessage, useLogin, usePublicNodeLocations } from "@/lib/api/hooks";

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  // Public, unauthenticated — see usePublicNodeLocations' own comment.
  // Fine to call from a page nobody has signed in on yet.
  const locations = usePublicNodeLocations();
  const points = locations.data?.locations ?? [];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    login.mutate(
      { email, password },
      // Root's own redirect logic decides where a signed-in customer
      // lands (their last-active project's dashboard, or /projects for
      // someone with none selected yet) — one place to keep in sync
      // rather than duplicating that choice here and in signup.
      { onSuccess: () => router.push("/") },
    );
  };

  return (
    <div className="flex min-h-dvh">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <Wordmark height={36} />
            <p className="text-muted-foreground mt-3 text-sm">
              Sign in to your account
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {login.isError && (
              <p className="text-destructive text-xs">
                {errorMessage(login.error)}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={login.isPending}
              className="mt-1"
            >
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-muted-foreground mt-6 text-xs">
            No account?{" "}
            <Link href="/signup" className="text-foreground hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>

      {/* Decorative fleet-location panel — hidden below md so a visitor on
          a phone gets the full-width form instead of a squeezed map.
          points is already empty until the query resolves, and the globe
          itself renders nothing when there is nothing to plot, so this
          degrades to a plain muted panel with no special-casing here. */}
      <div className="hairline-l bg-muted/30 border-border relative hidden flex-1 md:block">
        <PublicGlobe points={points} />
        {points.length > 0 && (
          <div className="identifier text-muted-foreground pointer-events-none absolute top-4 left-4 text-xs tracking-wider uppercase">
            Fleet: {points.length} Node{points.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
}
