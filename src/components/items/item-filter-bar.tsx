"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/field";
import {
  ITEM_KIND_LABELS,
  ITEM_KINDS,
  ITEM_STATUS_LABELS,
  ITEM_STATUSES,
} from "@/domain/items/item";

/**
 * Filters live in the URL, not in component state.
 *
 * That makes every filtered view linkable and shareable with your future self,
 * and means the server can render the result directly with no client store.
 */
export function ItemFilterBar({
  projects,
  defaultStatus = "open",
}: {
  projects: readonly { id: string; name: string }[];
  /** Matches the page default so the control reflects what is actually shown. */
  defaultStatus?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Select
        aria-label="Filter by type"
        value={searchParams.get("kind") ?? "all"}
        onChange={(event) => setParam("kind", event.target.value)}
        className="w-auto"
      >
        <option value="all">All types</option>
        {ITEM_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {ITEM_KIND_LABELS[kind]}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Filter by status"
        value={searchParams.get("status") ?? defaultStatus}
        onChange={(event) => setParam("status", event.target.value)}
        className="w-auto"
      >
        <option value="open">Open</option>
        {ITEM_STATUSES.map((status) => (
          <option key={status} value={status}>
            {ITEM_STATUS_LABELS[status]}
          </option>
        ))}
        <option value="all">Any status</option>
      </Select>

      {projects.length > 0 ? (
        <Select
          aria-label="Filter by project"
          value={searchParams.get("projectId") ?? ""}
          onChange={(event) => setParam("projectId", event.target.value)}
          className="w-auto"
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      ) : null}

      {searchParams.get("tag") ? (
        <button
          type="button"
          onClick={() => setParam("tag", "")}
          className="border-border text-muted-foreground hover:text-foreground rounded-md border px-2.5 text-sm"
        >
          #{searchParams.get("tag")} ×
        </button>
      ) : null}
    </div>
  );
}
