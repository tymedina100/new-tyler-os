"use client";

import { FolderGit2, Inbox, ListChecks, Refrigerator, Search, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Navigation.
 *
 * A sidebar on desktop, a bottom tab bar on a phone. The tab bar is not a
 * shrunken sidebar: it is where a thumb actually reaches.
 */

const NAV_ITEMS = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/projects", label: "Projects", icon: FolderGit2 },
  { href: "/kitchen", label: "Kitchen", icon: Refrigerator },
  { href: "/search", label: "Search", icon: Search },
] as const;

function useIsActive() {
  const pathname = usePathname();

  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

export function SidebarNav({ inboxCount }: { inboxCount: number }) {
  const isActive = useIsActive();

  return (
    <nav className="grid gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
            isActive(href)
              ? "bg-muted text-foreground font-medium"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">{label}</span>
          {href === "/inbox" && inboxCount > 0 ? (
            <span className="bg-background rounded px-1.5 py-0.5 text-[0.6875rem] font-medium tabular-nums">
              {inboxCount}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav({ inboxCount }: { inboxCount: number }) {
  const isActive = useIsActive();

  return (
    <nav className="border-border bg-card/95 fixed inset-x-0 bottom-0 z-40 flex border-t backdrop-blur md:hidden">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.6875rem]",
            isActive(href) ? "text-primary" : "text-muted-foreground",
          )}
        >
          <span className="relative">
            <Icon aria-hidden className="size-5" />
            {href === "/inbox" && inboxCount > 0 ? (
              <span className="bg-primary text-primary-foreground absolute -top-1 -right-2 min-w-4 rounded-full px-1 text-[0.625rem] leading-4 font-semibold tabular-nums">
                {inboxCount}
              </span>
            ) : null}
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
