"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Wordmark } from "@/components/ui/wordmark";
import { cn } from "@/lib/utils";
import { errorMessage, useLogin, useRegister } from "@/lib/api/hooks";
import type { AccountType } from "@/lib/api/types";

/**
 * Signup.
 *
 * One email = one account, as in AWS. The personal/organization choice
 * is made here because it determines the account's shape, and converting
 * personal → organization later is one-way.
 */
export default function SignupPage() {
  const router = useRouter();
  const register = useRegister();
  const login = useLogin();

  const [type, setType] = useState<AccountType>("personal");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    register.mutate(
      { type, display_name: displayName, email, password },
      {
        // Sign in immediately rather than bouncing to a login form the
        // customer just proved they can pass.
        onSuccess: () =>
          login.mutate(
            { email, password },
            { onSuccess: () => router.push("/compute") },
          ),
      },
    );
  };

  const busy = register.isPending || login.isPending;
  const error = register.error ?? login.error;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Wordmark height={36} />
          <p className="text-muted-foreground mt-3 text-sm">
            Create your account
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-foreground text-xs font-medium">
              Account type
            </span>
            <div className="grid grid-cols-2 gap-2">
              <TypeOption
                selected={type === "personal"}
                onClick={() => setType("personal")}
                title="Personal"
                description="Individual use"
              />
              <TypeOption
                selected={type === "organization"}
                onClick={() => setType("organization")}
                title="Organization"
                description="Team with sub-users"
              />
            </div>
          </div>

          <Field
            label={type === "organization" ? "Organization name" : "Your name"}
            htmlFor="display-name"
          >
            <Input
              id="display-name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>

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

          <Field
            label="Password"
            hint="At least 12 characters."
            htmlFor="password"
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && (
            <p className="text-destructive text-xs">{errorMessage(error)}</p>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={busy}
            className="mt-1"
          >
            {busy ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="text-muted-foreground mt-6 text-xs">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function TypeOption({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "hairline flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left",
        selected
          ? "border-foreground bg-muted"
          : "border-border hover:bg-muted/60",
      )}
    >
      <span className="text-foreground text-sm">{title}</span>
      <span className="text-muted-foreground text-xs">{description}</span>
    </button>
  );
}
