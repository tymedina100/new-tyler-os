"use client";

import { Command } from "cmdk";
import { FolderGit2, Inbox, ListChecks, Plus, Search, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { captureItemAction } from "@/server/actions/item-actions";

/**
 * The command palette.
 *
 * Three jobs, in the order they are used: go somewhere, capture something,
 * search for something. It is not an app-wide command registry - there are five
 * destinations and two verbs, and pretending otherwise would be architecture
 * for its own sake.
 */

const DESTINATIONS = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/projects", label: "Projects", icon: FolderGit2 },
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

      const result = await captureItemAction(null, formData);
      if (result.ok) {
        toast.success("Captured to your inbox.");
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
      className="animate-panel border-border bg-card fixed top-[12vh] left-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border shadow-2xl"
      overlayClassName="animate-overlay fixed inset-0 z-50 bg-overlay backdrop-blur-[1px]"
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

        {trimmed.length > 0 ? (
          <Command.Group
            heading="Actions"
            className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-medium"
          >
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
          </Command.Group>
        ) : null}

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
