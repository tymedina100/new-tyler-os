import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "border-border text-muted-foreground inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.6875rem] leading-none font-medium",
        className,
      )}
      {...props}
    />
  );
}
