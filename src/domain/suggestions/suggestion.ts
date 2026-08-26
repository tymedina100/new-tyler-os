import type { ItemKind } from "@/domain/items/item";

/**
 * A suggestion is a proposal, never a fact.
 *
 * TylerOS's first non-deterministic subsystem, and the rule it exists under is
 * the whole reason it is shaped like this: **AI may propose, the user decides,
 * deterministic facts win.** Nothing here is applied to an item until somebody
 * says so, and nothing here can reach an item except through the same item
 * service every other edit goes through.
 *
 * One row per proposed value, rather than one row holding a whole model
 * response. That is what makes partial acceptance free: "project: Home" and
 * "tag: maintenance" are two independent proposals, and accepting one has no
 * opinion about the other.
 */

/** What a single proposal is about. One value each, never a bundle. */
export const SUGGESTION_FIELDS = ["kind", "project", "tag"] as const;
export type SuggestionField = (typeof SUGGESTION_FIELDS)[number];

/**
 * Where a proposal stands.
 *
 * `dismissed` covers two different endings on purpose: the user waved it away,
 * and the item moved on underneath it. Both mean the same thing to everything
 * downstream — this proposal will never be applied — and distinguishing them
 * would be building a history nobody reads.
 */
export const SUGGESTION_STATUSES = ["pending", "accepted", "dismissed"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

/**
 * One stored proposal.
 *
 * Exactly one of `kind`, `projectId` and `tagName` is set, decided by `field`.
 * That is a tagged union rather than the mostly-null-columns smell ADR 001
 * warns about: every row uses its one value column, and the table exists for
 * this single purpose.
 */
export interface ItemSuggestion {
  id: string;
  itemId: string;
  field: SuggestionField;
  kind: ItemKind | null;
  projectId: string | null;
  tagName: string | null;
  status: SuggestionStatus;
  /** Provider and model that produced it. For debugging, not for display. */
  model: string;
  /**
   * The title the model was shown. If the item has been retitled since, every
   * proposal about it is about text that no longer exists.
   */
  observedTitle: string;
  /**
   * What this proposal's field held when the proposal was made, as text, with
   * the empty string meaning "nothing". Comparing it against the live item is
   * how a newer manual choice survives a stale acceptance — see
   * `reconcileSuggestion`.
   */
  observedValue: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

/** A proposal with the project resolved, so the UI never has to look one up. */
export interface ItemSuggestionView extends ItemSuggestion {
  project: { id: string; name: string } | null;
}

/**
 * A validated, grounded proposal on its way to being stored.
 *
 * The difference between this and whatever the model returned is the whole
 * safety story: a name has become an id that exists, a kind has become a real
 * enum member, and anything that could not be grounded is simply gone.
 */
export interface SuggestionProposal {
  field: SuggestionField;
  kind: ItemKind | null;
  projectId: string | null;
  tagName: string | null;
  observedValue: string;
}

export const SUGGESTION_FIELD_LABELS: Record<SuggestionField, string> = {
  kind: "Type",
  project: "Project",
  tag: "Tag",
};
