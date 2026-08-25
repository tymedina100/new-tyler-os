import { CalendarDays, FolderGit2, Hash } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ITEM_KIND_LABELS, type ItemKind } from "@/domain/items/item";
import { compareIsoDate, formatDueDate, type IsoDate } from "@/domain/shared/date";
import { cn } from "@/lib/cn";

/**
 * Badges carry the metadata of an item.
 *
 * Only the due date is ever coloured, and only when it is today or already past.
 * If everything is highlighted, nothing is.
 */

export function KindBadge({ kind }: { kind: ItemKind }) {
  return <Badge>{ITEM_KIND_LABELS[kind]}</Badge>;
}

export function DueBadge({ dueOn, today }: { dueOn: IsoDate; today: IsoDate }) {
  const relation = compareIsoDate(dueOn, today);

  return (
    <Badge
      className={cn(
        relation < 0 && "border-destructive/40 text-destructive",
        relation === 0 && "border-primary/40 text-primary",
      )}
    >
      <CalendarDays aria-hidden className="size-3" />
      {formatDueDate(dueOn, today)}
    </Badge>
  );
}

export function ProjectBadge({ project }: { project: { id: string; name: string } }) {
  return (
    <Link href={`/projects/${project.id}`} className="hover:text-foreground rounded">
      <Badge className="hover:border-input">
        <FolderGit2 aria-hidden className="size-3" />
        {project.name}
      </Badge>
    </Link>
  );
}

export function TagBadge({ name }: { name: string }) {
  return (
    <Link
      href={`/search?tag=${encodeURIComponent(name)}`}
      className="hover:text-foreground rounded"
    >
      <Badge className="hover:border-input">
        <Hash aria-hidden className="size-3" />
        {name}
      </Badge>
    </Link>
  );
}
