"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  CreditCard,
  Cpu,
  Database,
  LifeBuoy,
  LogOut,
  Moon,
  Package,
  Settings,
  Sun,
  BookOpen,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { cn, formatAccountNumber } from "@/lib/utils";
import { tokens } from "@/lib/api/client";
import { clearActiveProject } from "@/lib/active-project";
import type { Project } from "@/lib/api/types";
import { useTheme } from "@/components/theme-provider";
import { ProjectSwitcher } from "@/components/shell/project-switcher";

/**
 * The navigation shell.
 *
 * Account → project → service stays visible at all times rather than
 * being buried in breadcrumbs: a customer with three projects needs to
 * know which one they are about to spend money in, permanently, not
 * after reading the URL.
 *
 * No motion anywhere in here. Navigation state changes instantly —
 * animation is reserved for things that carry meaning, and moving
 * between pages does not.
 */

type NavItem = {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Unbuilt services are shown, greyed, with a `soon` tag: the
      platform's direction should be legible without a blog post. */
  soon?: boolean;
  /** Inline context — instance count, month-to-date spend. */
  meta?: string;
};

export function Sidebar({
  accountName,
  accountNumber,
  projects,
  activeProject,
  onSelectProject,
  instanceCount,
  monthToDate,
}: {
  accountName: string;
  accountNumber: string;
  projects: Project[];
  activeProject?: Project;
  onSelectProject: (id: string) => void;
  instanceCount?: number;
  monthToDate?: string;
}) {
  const pathname = usePathname();

  const projectItems: NavItem[] = [
    {
      label: "GPU compute",
      href: "/compute",
      icon: Cpu,
      meta: instanceCount !== undefined ? String(instanceCount) : undefined,
    },
    { label: "CPU compute", icon: Cpu, soon: true },
    { label: "Storage", icon: Database, soon: true },
    { label: "Registry", href: "/registry", icon: Package },
    // Settings belong to the project being viewed, so the link carries
    // its ID rather than pointing at a page that has to guess.
    {
      label: "Project settings",
      href: activeProject ? `/projects/${activeProject.id}` : undefined,
      icon: Settings,
    },
  ];

  const accountItems: NavItem[] = [
    { label: "Billing", href: "/billing", icon: CreditCard, meta: monthToDate },
    { label: "Account", href: "/settings/account", icon: Settings },
  ];

  return (
    <aside className="hairline-r flex h-dvh w-60 shrink-0 flex-col border-border bg-card">
      {/* Account identity. The number is pinned because customers quote
          it to support, and hunting for it during an incident is a
          small, avoidable indignity. */}
      <div className="hairline-b border-border px-3 py-3">
        <div className="text-foreground truncate text-sm font-medium">
          {accountName}
        </div>
        <div className="identifier text-muted-foreground mt-0.5">
          {formatAccountNumber(accountNumber)}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <NavLink
          href="/projects"
          icon={Boxes}
          label="Projects"
          active={pathname.startsWith("/projects")}
        />

        <div className="mt-4 mb-1 px-1">
          <ProjectSwitcher
            projects={projects}
            active={activeProject}
            onSelect={onSelectProject}
          />
        </div>

        {projectItems.map((item) => (
          <NavLink
            key={item.label}
            {...item}
            active={item.href ? pathname.startsWith(item.href) : false}
          />
        ))}

        <div className="hairline-b my-3 border-border" />

        {accountItems.map((item) => (
          <NavLink
            key={item.label}
            {...item}
            active={item.href ? pathname.startsWith(item.href) : false}
          />
        ))}
      </nav>

      <div className="hairline-t border-border px-2 py-2">
        <a
          href="https://docs.teepin.com"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground flex h-7 items-center gap-2 rounded px-2 text-xs"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Docs
        </a>
        <a
          href="mailto:support@teepin.com"
          className="text-muted-foreground hover:text-foreground flex h-7 items-center gap-2 rounded px-2 text-xs"
        >
          <LifeBuoy className="h-3.5 w-3.5" />
          Support
        </a>
        <ThemeToggle />
        <SignOut />
      </div>
    </aside>
  );
}

function NavLink({
  label,
  href,
  icon: Icon,
  soon,
  meta,
  active,
}: NavItem & { active?: boolean }) {
  const content = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {soon && (
        <span className="text-muted-foreground/70 text-[10px]">soon</span>
      )}
      {meta && !soon && (
        <span className="tabular text-muted-foreground text-xs">{meta}</span>
      )}
    </>
  );

  const className = cn(
    "flex h-7 items-center gap-2 rounded px-2 text-sm",
    active
      ? "bg-muted text-foreground font-medium"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
    soon && "cursor-default opacity-50 hover:bg-transparent hover:text-muted-foreground",
  );

  if (!href || soon) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function SignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const signOut = () => {
    // Clear the cache before navigating. React Query would otherwise
    // hold this account's instances, projects and billing in memory, and
    // the next person to sign in on this machine would see a flash of
    // the previous account's data before their own queries resolve.
    queryClient.clear();

    // Removes the JWT, the refresh token AND the project API key. Leaving
    // the API key behind would let a signed-out browser keep calling
    // compute endpoints — it authenticates independently of the session.
    tokens.clear();

    // The project store is module-level and outlives navigation, so it
    // has to be reset explicitly.
    clearActiveProject();

    // replace, not push: the back button must not return to a page that
    // renders account data from a cleared session.
    router.replace("/login");
  };

  return (
    <button
      onClick={signOut}
      className="text-muted-foreground hover:text-foreground flex h-7 w-full items-center gap-2 rounded px-2 text-xs"
    >
      <LogOut className="h-3.5 w-3.5" />
      Sign out
    </button>
  );
}

function ThemeToggle() {
  const { resolved, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
      className="text-muted-foreground hover:text-foreground flex h-7 w-full items-center gap-2 rounded px-2 text-xs"
    >
      {resolved === "dark" ? (
        <Sun className="h-3.5 w-3.5" />
      ) : (
        <Moon className="h-3.5 w-3.5" />
      )}
      {resolved === "dark" ? "Light" : "Dark"} theme
    </button>
  );
}
