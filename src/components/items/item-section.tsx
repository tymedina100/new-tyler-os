import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type SectionTone = "neutral" | "urgent" | "now";

/**
 * A labelled group of items. The count sits in the heading so the page can be
 * scanned without reading a single row.
 */
export function ItemSection({
  title,
  count,
  tone = "neutral",
  children,
}: {
  title: string;
  count: number;
  tone?: SectionTone;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <h2 className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
        <span
          className={cn(
            tone === "urgent" && "text-destructive",
            tone === "now" && "text-primary",
            tone === "neutral" && "text-muted-foreground",
          )}
        >
          {title}
        </span>
        <span className="text-muted-foreground font-normal tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}
