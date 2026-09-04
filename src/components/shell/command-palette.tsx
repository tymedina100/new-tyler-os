"use client";

import { Command } from "cmdk";
import {
  CalendarRange,
  FolderGit2,
  Inbox,
  ListChecks,
  NotebookText,
  Plus,
  Refrigerator,
  Search,
  ShoppingCart,
  Sun,
  Workflow,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { captureAction } from "@/server/actions/capture-actions";

/**
 * The command palette.
 *
 * Three jobs, in the order they are used: go somewhere, capture something,
 * search for something. It is not an app-wide command registry - it lists the
 * same destinations the sidebar does and two verbs, and pretending otherwise
 * would be architecture for its own sake.
 */

const DESTINATIONS = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/upcoming", label: "Upcoming", icon: CalendarRange },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/projects", label: "Projects", icon: FolderGit2 },
  { href: "/notes", label: "Notes", icon: NotebookText },
  { href: "/kitchen", label: "Kitchen", icon: Refrigerator },
  { href: "/kitchen/shopping", label: "Shopping list", icon: ShoppingCart },
  { href: "/runs", label: "Runs", icon: Workflow },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  function capture() {
    const text = query.trim();
    if (text.length === 0) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("text", text);

      const result = await captureAction(null, formData);
      if (result.ok) {
        toast.success("Captured to your inbox.");
        close();
      } else {
        toast.error(result.error);
      }
    });
  }

  /**
   * "New note," with and without something already typed.
   *
   * `note:` with nothing after it deliberately falls through to an ordinary
   * item capture (`matchNotePrefix` returns `null`) — so an empty query here
   * must never submit a bare `note: `, which would silently create an item
   * titled "note:" instead of doing anything note-shaped. Routing to `/notes`
   * — where the quick-capture box sits at the very top of the page — is the
   * empty-query answer instead of pretending there is text to capture.
   */
  function newNote() {
    const text = query.trim();
    if (text.length === 0) {
      go("/notes");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("text", `note: ${text}`);

      const result = await captureAction(null, formData);
      if (result.ok) {
        toast.success("Note created.");
        close();
      } else {
        toast.error(result.error);
      }
    });
  }

  const trimmed = query.trim();

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      label="Command palette"
      shouldFilter={false}
      overlayClassName="animate-overlay bg-overlay fixed inset-0 z-50 backdrop-blur-[1px]"
      // cmdk sends `className` to the inner command element, so the panel itself
      // has to be styled through `contentClassName`.
      contentClassName="animate-panel border-border bg-card fixed top-[12vh] left-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border shadow-2xl"
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Go to, capture, or search…"
        className="border-border placeholder:text-muted-foreground h-12 w-full border-b bg-transparent px-4 text-sm outline-none"
      />

      <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto p-1.5">
        <Command.Group
          heading="Go to"
          className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-medium"
        >
          {DESTINATIONS.filter(
            ({ label }) =>
              trimmed.length === 0 || label.toLowerCase().includes(trimmed.toLowerCase()),
          ).map(({ href, label, icon: Icon }) => (
            <PaletteItem key={href} onSelect={() => go(href)}>
              <Icon aria-hidden className="text-muted-foreground size-4" />
              {label}
            </PaletteItem>
          ))}
        </Command.Group>

        <Command.Group
          heading="Actions"
          className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-medium"
        >
          {trimmed.length > 0 ? (
            <>
              <PaletteItem onSelect={capture} disabled={isPending}>
                <Plus aria-hidden className="text-muted-foreground size-4" />
                <span className="truncate">
                  Capture <span className="text-muted-foreground">“{trimmed}”</span>
                </span>
              </PaletteItem>
              <PaletteItem onSelect={() => go(`/search?q=${encodeURIComponent(trimmed)}`)}>
                <Search aria-hidden className="text-muted-foreground size-4" />
                <span className="truncate">
                  Search for <span className="text-muted-foreground">“{trimmed}”</span>
                </span>
              </PaletteItem>
            </>
          ) : null}
          <PaletteItem onSelect={newNote} disabled={isPending}>
            <NotebookText aria-hidden className="text-muted-foreground size-4" />
            <span className="truncate">
              {trimmed.length > 0 ? (
                <>
                  New note <span className="text-muted-foreground">“{trimmed}”</span>
                </>
              ) : (
                "New note"
              )}
            </span>
          </PaletteItem>
        </Command.Group>

        <Command.Empty className="text-muted-foreground px-3 py-6 text-center text-sm">
          Type to capture or search.
        </Command.Empty>
      </Command.List>
    </Command.Dialog>
  );
}

function PaletteItem({
  children,
  onSelect,
  disabled,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      disabled={disabled}
      className="data-[selected=true]:bg-muted flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm select-none data-[disabled=true]:opacity-50"
    >
      {children}
    </Command.Item>
  );
}
