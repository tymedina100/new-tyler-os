"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Thin styling over Radix so overflow menus stay keyboard navigable. */
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ className, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          "animate-panel border-border bg-card z-50 min-w-44 rounded-lg border p-1 shadow-lg",
          // An item row's menu is long - type, due date, repeat, lifecycle - and
          // it grew past a phone's screen the moment repeats were added to it.
          // Radix measures the room it actually has; this uses it and scrolls
          // rather than letting the bottom of the menu fall off the display.
          "max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto",
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof DropdownMenu.Item>) {
  return (
    <DropdownMenu.Item
      className={cn(
        "data-[highlighted]:bg-muted [&_svg]:text-muted-foreground flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none select-none [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn("text-muted-foreground px-2 pt-2 pb-1 text-[0.6875rem] font-medium", className)}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="bg-border my-1 h-px" />;
}
