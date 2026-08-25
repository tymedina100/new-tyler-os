import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Empty states say what to do next. A blank panel reading "No items" teaches
 * nothing and makes a new system feel broken rather than new.
 */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("bg-muted animate-pulse rounded-md", className)} {...props} />;
}

/** A stand-in list used while a route's data is still loading. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}
