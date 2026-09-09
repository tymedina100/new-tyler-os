"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  CalendarRange,
  FolderGit2,
  Gauge,
  Inbox,
  ListChecks,
  MoreHorizontal,
  NotebookText,
  Plus,
  Refrigerator,
  Search,
  ShoppingCart,
  Sun,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CAPTURE_INPUT_ID } from "@/components/shell/capture-bar";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { cn } from "@/lib/cn";

/**
 * Navigation.
 *
 * A sidebar on desktop, a bottom tab bar on a phone. The tab bar is not a
 * shrunken sidebar: it is where a thumb actually reaches.
 *
 * The phone bar stopped being all seven desktop destinations once TylerOS grew
 * an eighth thing worth reaching (search) with no room left to add it: seven
 * items at 375px were already each narrower than their own label. Rather than
 * add an eighth, the bar now carries the four things asked for daily — Today,
 * Inbox, capture, Search — plus a fifth slot that opens the rest. Desktop
 * keeps every destination visible, because a sidebar has the width to.
 */

const SIDEBAR_ITEMS = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/upcoming", label: "Upcoming", icon: CalendarRange },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/projects", label: "Projects", icon: FolderGit2 },
  { href: "/notes", label: "Notes", icon: NotebookText },
  { href: "/knowledge", label: "Knowledge", icon: NotebookText },
  { href: "/kitchen", label: "Kitchen", icon: Refrigerator },
  { href: "/food", label: "Food & drink", icon: Refrigerator },
  { href: "/search", label: "Search", icon: Search },
  { href: "/runs", label: "Runs", icon: Workflow },
  { href: "/capacity", label: "Capacity", icon: Gauge },
] as const;

/** The bar's three real links. Capture and More are buttons, not routes. */
const PRIMARY_ITEMS = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/search", label: "Search", icon: Search },
] as const;

/** Everything reachable only through the More sheet on a phone. */
const SECONDARY_ITEMS = [
  { href: "/upcoming", label: "Upcoming", icon: CalendarRange },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/projects", label: "Projects", icon: FolderGit2 },
  { href: "/notes", label: "Notes", icon: NotebookText },
  { href: "/knowledge", label: "Knowledge", icon: NotebookText },
  { href: "/kitchen", label: "Kitchen", icon: Refrigerator },
  { href: "/food", label: "Food & drink", icon: Refrigerator },
  { href: "/kitchen/shopping", label: "Shopping list", icon: ShoppingCart },
  { href: "/runs", label: "Runs", icon: Workflow },
  { href: "/capacity", label: "Capacity", icon: Gauge },
] as const;

function useIsActive() {
  const pathname = usePathname();

  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

export function SidebarNav({ inboxCount }: { inboxCount: number }) {
  const isActive = useIsActive();

  return (
    <nav className="grid gap-0.5">
      {SIDEBAR_ITEMS.map(({ href, label, icon: Icon }) => (
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
      {PRIMARY_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "relative flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2.5 text-[0.625rem]",
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
          <span className="w-full truncate text-center">{label}</span>
        </Link>
      ))}

      <CaptureTab />
      <MoreSheet isActive={isActive} />
    </nav>
  );
}

/** Focuses the one capture box every screen already has, rather than opening
 * a second one. See `src/components/shell/capture-bar.tsx`. */
function CaptureTab() {
  function focusCapture() {
    const input = document.getElementById(CAPTURE_INPUT_ID);
    input?.focus();
    input?.scrollIntoView({ block: "center" });
  }

  return (
    <button
      type="button"
      onClick={focusCapture}
      className="text-muted-foreground relative flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2.5 text-[0.625rem]"
    >
      <Plus aria-hidden className="size-5" />
      <span className="w-full truncate text-center">Capture</span>
    </button>
  );
}

function MoreSheet({ isActive }: { isActive: (href: string) => boolean }) {
  const isAnyActive = SECONDARY_ITEMS.some((item) => isActive(item.href));

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="More destinations"
          className={cn(
            "relative flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2.5 text-[0.625rem]",
            isAnyActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          <MoreHorizontal aria-hidden className="size-5" />
          <span className="w-full truncate text-center">More</span>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay bg-overlay fixed inset-0 z-50" />
        <Dialog.Content className="animate-sheet border-border bg-card fixed inset-x-0 bottom-0 z-50 rounded-t-xl border-t p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl">
          <Dialog.Title className="text-muted-foreground px-3 py-2 text-xs font-medium">
            More
          </Dialog.Title>

          <nav className="grid gap-0.5">
            {SECONDARY_ITEMS.map(({ href, label, icon: Icon }) => (
              <Dialog.Close asChild key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={cn(
                    // py-3.5 rather than py-2.5: a 40px row measured under the
                    // 44px tap-target floor at 375px, found by measuring
                    // rather than by looking. See docs/VERIFICATION.md 0.7.
                    "flex min-h-11 items-center gap-3 rounded-md px-3 py-3.5 text-sm",
                    isActive(href) ? "bg-muted text-foreground font-medium" : "text-foreground",
                  )}
                >
                  <Icon aria-hidden className="size-[1.125rem] shrink-0" />
                  {label}
                </Link>
              </Dialog.Close>
            ))}
          </nav>

          <div className="border-border mt-1 border-t pt-1">
            <SignOutButton className="min-h-11 px-3 py-3.5 text-sm" />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
