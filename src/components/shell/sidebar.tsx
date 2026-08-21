"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Boxes,
  ChevronDown,
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
  Zap,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { cn, formatAccountNumber } from "@/lib/utils";
import { tokens } from "@/lib/api/client";
import { clearActiveProject } from "@/lib/active-project";
import type { Project } from "@/lib/api/types";
import { useTheme } from "@/components/theme-provider";
import { ProjectSwitcher } from "@/components/shell/project-switcher";
import { Wordmark } from "@/components/ui/wordmark";

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
  /** Optional: top-level items carry an icon; nested group children are
      rendered without one (they read as a subtree under the parent). */
  icon?: React.ComponentType<{ className?: string }>;
  /** Unbuilt services are shown, greyed, with a `soon` tag: the
      platform's direction should be legible without a blog post. */
  soon?: boolean;
  /** Inline context — instance count, month-to-date spend. */
  meta?: string;
};

/**
 * Which compute section (GPU or CPU) owns the instance detail page
 * currently on screen.
 *
 * GPU and CPU instance detail share one URL shape, /compute/[id] — the
 * path alone can't say which section a given instance belongs to, since
 * that depends on the instance's own type (gpu.* vs everything else),
 * known only once its data has loaded. The detail page announces its
 * section here via useAnnounceComputeSection; the sidebar reads it to
 * highlight the right link instead of defaulting to GPU by URL prefix.
 * Reset on unmount so navigating away (or to a page that never
 * announces) doesn't leave a stale section highlighted.
 */
const detailSectionStore = {
  current: null as "gpu" | "cpu" | null,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    detailSectionStore.listeners.add(listener);
    return () => detailSectionStore.listeners.delete(listener);
  },
  get() {
    return detailSectionStore.current;
  },
  set(section: "gpu" | "cpu" | null) {
    if (detailSectionStore.current === section) return;
    detailSectionStore.current = section;
    detailSectionStore.listeners.forEach((l) => l());
  },
};

/** Called by the instance detail page once it knows which section its
 *  instance belongs to (or with null while still loading / on unmount). */
export function useAnnounceComputeSection(section: "gpu" | "cpu" | null) {
  useEffect(() => {
    detailSectionStore.set(section);
    return () => detailSectionStore.set(null);
  }, [section]);
}

function useDetailSection() {
  return useSyncExternalStore(
    detailSectionStore.subscribe,
    detailSectionStore.get,
    () => null,
  );
}

export function Sidebar({
  accountName,
  accountNumber,
  projects,
  activeProject,
  onSelectProject,
  gpuRunning,
  cpuRunning,
  monthToDate,
}: {
  accountName: string;
  accountNumber: string;
  projects: Project[];
  activeProject?: Project;
  onSelectProject: (id: string) => void;
  /** Running GPU / CPU instance counts. Shown as a badge only when > 0 —
      a zero badge is noise, and the number means "running right now". */
  gpuRunning?: number;
  cpuRunning?: number;
  monthToDate?: string;
}) {
  const pathname = usePathname();
  const detailSection = useDetailSection();

  // /compute/[id] is shared by GPU and CPU instances — neither "/compute"
  // nor "/compute/cpu" is a real prefix match for it in the way that
  // distinguishes the two list pages. On such a page, trust the section
  // the detail page announced (once its instance has loaded) instead of
  // the URL, which cannot tell GPU and CPU instances apart.
  const onInstanceDetail =
    pathname.startsWith("/compute/") && pathname !== "/compute/cpu";

  const projectItems: NavItem[] = [
    {
      label: "GPU compute",
      href: "/compute",
      icon: Zap,
      meta: gpuRunning ? String(gpuRunning) : undefined,
    },
    {
      label: "CPU compute",
      href: "/compute/cpu",
      icon: Cpu,
      meta: cpuRunning ? String(cpuRunning) : undefined,
    },
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

  // Billing is one expandable group — "Billing & Cost Management" — the
  // way AWS groups Bills / Payments / Credits under a single heading,
  // rather than scattering them as sibling top-level links. Each child is
  // its own screen.
  const billingChildren: NavItem[] = [
    { label: "Bills", href: "/billing", meta: monthToDate },
    { label: "Payments", href: "/settings/payment" },
    { label: "Credits", href: "/billing/credits" },
  ];

  const accountItems: NavItem[] = [
    { label: "Account", href: "/settings/account", icon: Settings },
  ];

  // Every nav href, so the active-route matcher can defer to the most
  // specific sibling (e.g. /compute/cpu wins over /compute).
  const allHrefs = [
    "/projects",
    ...projectItems,
    ...billingChildren,
    ...accountItems,
  ]
    .map((i) => (typeof i === "string" ? i : i.href))
    .filter((h): h is string => Boolean(h));

  return (
    <aside className="hairline-r flex h-dvh w-60 shrink-0 flex-col border-border bg-card">
      {/* Account identity. The number is pinned because customers quote
          it to support, and hunting for it during an incident is a
          small, avoidable indignity. */}
      <div className="hairline-b border-border px-3 py-3">
        <Wordmark height={32} className="mb-3" />
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
          active={isActiveRoute(pathname, "/projects", allHrefs)}
        />

        <div className="mt-4 mb-1 px-1">
          <ProjectSwitcher
            projects={projects}
            active={activeProject}
            onSelect={onSelectProject}
          />
        </div>

        {projectItems.map((item) => {
          let active = item.href
            ? isActiveRoute(pathname, item.href, allHrefs)
            : false;
          // On a shared /compute/[id] detail page, override the URL-based
          // guess with the section the page itself announced.
          if (onInstanceDetail && detailSection) {
            active =
              (item.label === "GPU compute" && detailSection === "gpu") ||
              (item.label === "CPU compute" && detailSection === "cpu");
          }
          return <NavLink key={item.label} {...item} active={active} />;
        })}

        <div className="hairline-b my-3 border-border" />

        <NavGroup
          label="Billing & Cost Management"
          icon={CreditCard}
          items={billingChildren}
          pathname={pathname}
          siblings={allHrefs}
        />

        {accountItems.map((item) => (
          <NavLink
            key={item.label}
            {...item}
            active={item.href ? isActiveRoute(pathname, item.href, allHrefs) : false}
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
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
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

/**
 * A collapsible nav group: a parent heading that expands to child links,
 * each its own screen. Used for "Billing & Cost Management".
 *
 * Starts expanded when one of its children is the active route, so a
 * customer deep-linked to /settings/payment lands with the group open and
 * the item highlighted. After that it is a normal toggle.
 */
function NavGroup({
  label,
  icon: Icon,
  items,
  pathname,
  siblings,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  pathname: string;
  siblings: string[];
}) {
  const childActive = (href?: string) =>
    href ? isActiveRoute(pathname, href, siblings) : false;
  const anyActive = items.some((c) => childActive(c.href));

  // `userOpen` is the explicit toggle; the group is shown open whenever
  // the user opened it OR a child is the active route. Deriving `open`
  // rather than syncing it in an effect avoids a setState-in-effect
  // cascade — the active child forces the group open without extra state.
  const [userOpen, setUserOpen] = useState(false);
  const open = userOpen || anyActive;

  return (
    <div>
      <button
        onClick={() => setUserOpen((v) => !v)}
        className={cn(
          "flex h-7 w-full items-center gap-2 rounded px-2 text-sm",
          anyActive
            ? "text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        )}
        aria-expanded={open}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            open ? "" : "-rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {items.map((child) => (
            <Link
              key={child.label}
              href={child.href ?? "#"}
              className={cn(
                // Indented under the parent, with a rail to read as a
                // subtree rather than a sibling list.
                "hairline-l ml-3 flex h-7 items-center gap-2 border-border pl-3 pr-2 text-sm",
                childActive(child.href)
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              <span className="flex-1 truncate">{child.label}</span>
              {child.meta && (
                <span className="tabular text-muted-foreground text-xs">
                  {child.meta}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Whether `href` is the active route, given the full set of sibling nav
 * hrefs.
 *
 * Exact match always wins. For a deeper path (e.g. /compute/cpu, or
 * /billing/invoices/123) the item is active only if it is the LONGEST
 * matching prefix among all siblings — so /compute does not light up while
 * on /compute/cpu (that's CPU compute's route), but /billing still lights
 * up on /billing/invoices/123 (no sibling owns that path). This is the
 * general rule; it needs no per-route special cases.
 */
function isActiveRoute(
  pathname: string,
  href: string,
  siblings: string[],
): boolean {
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  // A more specific sibling (a longer href that also matches) owns this
  // path — defer to it so only one item is ever active.
  return !siblings.some(
    (other) =>
      other.length > href.length &&
      (pathname === other || pathname.startsWith(other + "/")),
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
