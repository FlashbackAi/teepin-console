"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Wordmark } from "@/components/ui/wordmark";
import { admin, adminToken } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

/**
 * Control centre — TEEPIN's own operator console.
 *
 * NOT a customer surface. It authenticates with the operator's
 * ADMIN_API_TOKEN, which grants access to every account on the platform,
 * so it is deliberately kept outside the customer app shell: different
 * chrome, different auth, no shared navigation that could let a
 * misconfigured route leak one into the other.
 *
 * The token lives in sessionStorage and is verified against the API
 * before anything renders. A wrong token shows the unlock form again
 * rather than a broken console.
 */
export default function ControlCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);

  // Re-verify on mount rather than trusting the stored token: it may
  // have been rotated since the tab was opened.
  useEffect(() => {
    if (!adminToken.get()) {
      setChecking(false);
      return;
    }
    admin
      .verify()
      .then(() => setUnlocked(true))
      .catch(() => adminToken.clear())
      .finally(() => setChecking(false));
  }, []);

  if (checking) return null;
  if (!unlocked) return <Unlock onUnlocked={() => setUnlocked(true)} />;

  return <Shell>{children}</Shell>;
}

function Unlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    adminToken.set(token);
    try {
      // Verify before unlocking, so a bad token fails here rather than
      // on every subsequent screen.
      await admin.verify();
      onUnlocked();
    } catch (err) {
      adminToken.clear();
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Wordmark height={36} />
          <p className="text-muted-foreground mt-3 text-sm">Control centre</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label="Admin token"
            hint="Operator access. Not a customer credential."
            error={error ?? undefined}
            htmlFor="admin-token"
          >
            <Input
              id="admin-token"
              type="password"
              autoComplete="off"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </Field>

          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Verifying…" : "Unlock"}
          </Button>
        </form>

        <p className="text-muted-foreground mt-6 text-xs">
          <Link href="/compute" className="hover:underline">
            Back to the console
          </Link>
        </p>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const items = [
    { label: "Accounts", href: "/controlcenter" },
    { label: "Nodes", href: "/controlcenter/nodes" },
    { label: "Inference", href: "/controlcenter/inference" },
    { label: "Kumbha", href: "/controlcenter/kumbha" },
    { label: "Pricing", href: "/controlcenter/pricing" },
  ];

  return (
    <div className="flex">
      <aside className="hairline-r flex h-dvh w-52 shrink-0 flex-col border-border bg-card">
        <div className="hairline-b border-border px-3 py-3">
          <Wordmark height={28} className="mb-3" />
          {/* Unmistakable: an operator must never confuse this with a
              customer's own console, because every action here is taken
              on someone else's account. */}
          <div className="text-warning text-xs font-medium tracking-wide uppercase">
            Control centre
          </div>
          <div className="text-muted-foreground mt-0.5 text-xs">
            Operator access
          </div>
        </div>

        <nav className="flex-1 px-2 py-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-7 items-center rounded px-2 text-sm",
                pathname === item.href
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hairline-t border-border px-2 py-2">
          <Link
            href="/compute"
            className="text-muted-foreground hover:text-foreground flex h-7 items-center rounded px-2 text-xs"
          >
            Back to console
          </Link>
          <button
            onClick={() => {
              adminToken.clear();
              window.location.reload();
            }}
            className="text-muted-foreground hover:text-foreground flex h-7 w-full items-center rounded px-2 text-xs"
          >
            Lock
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
