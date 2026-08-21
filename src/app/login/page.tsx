"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Wordmark } from "@/components/ui/wordmark";
import { errorMessage, useLogin } from "@/lib/api/hooks";

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: () => router.push("/compute") },
    );
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
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
  );
}
