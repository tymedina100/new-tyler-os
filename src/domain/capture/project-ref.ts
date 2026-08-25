import type { ProjectRef } from "@/domain/projects/project";

/**
 * Resolving `@project` in captured text.
 *
 * Project names are written for people ("Kitchen Refresh"), and `@` references
 * are typed at speed with no spaces. Matching therefore ignores case and
 * punctuation, so `@kitchenrefresh`, `@Kitchen-Refresh` and `@kitchen` all reach
 * the same project.
 *
 * Confidence matters more than cleverness here. A reference that could mean two
 * projects means neither: assigning the wrong one is worse than assigning none,
 * because nobody re-reads an item that already looks filed.
 */

export type ProjectRefMatch =
  | { outcome: "matched"; project: ProjectRef }
  | { outcome: "ambiguous"; candidates: ProjectRef[] }
  | { outcome: "unknown" };

/** Case and punctuation carry no meaning in a typed reference. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function matchProjectRef(ref: string, projects: readonly ProjectRef[]): ProjectRefMatch {
  const needle = normalize(ref);
  if (needle.length === 0) return { outcome: "unknown" };

  const exact = projects.filter((project) => normalize(project.name) === needle);
  if (exact.length === 1 && exact[0] !== undefined) {
    return { outcome: "matched", project: exact[0] };
  }
  // Two projects normalising identically is a data problem, not a guess to make.
  if (exact.length > 1) return { outcome: "ambiguous", candidates: exact };

  const prefixed = projects.filter((project) => normalize(project.name).startsWith(needle));
  if (prefixed.length === 1 && prefixed[0] !== undefined) {
    return { outcome: "matched", project: prefixed[0] };
  }
  if (prefixed.length > 1) return { outcome: "ambiguous", candidates: prefixed };

  return { outcome: "unknown" };
}
