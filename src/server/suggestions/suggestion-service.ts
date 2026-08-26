import type { ItemSuggestion, ItemSuggestionView } from "@/domain/suggestions/suggestion";
import type {
  SuggestionOutcome,
  SuggestionVocabulary,
} from "@/domain/suggestions/suggestion-rules";
import {
  groundSuggestion,
  hasAnyGap,
  reconcileSuggestion,
  suggestionGaps,
} from "@/domain/suggestions/suggestion-rules";
import { NotFoundError } from "@/domain/shared/errors";
import type { Classifier, ClassificationFailure } from "@/server/ai/classify-capture";
import type { Database } from "@/server/db/client";
import * as items from "@/server/items/item-service";
import * as itemRepo from "@/server/items/item-repository";
import { listSuggestibleProjectRefs } from "@/server/projects/project-repository";
import { listTagNamesByUsage } from "@/server/tags/tag-repository";
import * as repo from "./suggestion-repository";

/**
 * Suggestion use cases.
 *
 * A service, so it orchestrates and decides nothing: `suggestionGaps` says what
 * to ask, `groundSuggestion` says what survived, `reconcileSuggestion` says
 * whether accepting still holds. All three are pure and live in the domain.
 *
 * The classifier arrives as an **argument**, exactly the way `db` does. That is
 * what keeps `pnpm test` free of the network without an interface, an adapter
 * or a registry standing in for one implementation.
 *
 * Nothing here writes to an item directly. Accepting a proposal calls the same
 * `setItemKind` / `setItemProject` / `addItemTag` the row menu and the editor
 * call, so there is no second way for an item to change and no rule an AI path
 * could quietly skip.
 */

/** Big enough to cover a personal system, small enough to keep the request tiny. */
const MAX_SUGGESTIBLE_PROJECTS = 50;
const MAX_SUGGESTIBLE_TAGS = 40;

/**
 * What one run did. Every branch is a normal outcome, including the failures —
 * an optional subsystem that could not run is not an error, it is a subsystem
 * that did not run.
 */
export type SuggestionRunOutcome =
  | { status: "stored"; count: number }
  | {
      status: "skipped";
      reason: "item_gone" | "already_decided" | "already_suggested" | "nothing_grounded";
    }
  | { status: "failed"; failure: ClassificationFailure };

/**
 * Proposing for one freshly captured item.
 *
 * Runs after capture has already returned, so nothing it does can slow the one
 * interaction in TylerOS that must never be slow. Every exit below is a quiet
 * one: no throw reaches the user, and the item is untouched in all of them.
 */
export async function suggestForItem(
  db: Database,
  itemId: string,
  classify: Classifier,
  now = new Date(),
): Promise<SuggestionRunOutcome> {
  const item = await itemRepo.findItemById(db, itemId);
  // Deleted between capture and here. Nothing to propose about, and the FK
  // would refuse the insert anyway.
  if (item === null) return { status: "skipped", reason: "item_gone" };

  const gaps = suggestionGaps(item);
  // Everything the parser understood is already filled in, or the user has
  // filed this themselves. Either way there is no question worth the request —
  // and not asking is free, which is the cheapest kind of cost control.
  if (!hasAnyGap(gaps)) return { status: "skipped", reason: "already_decided" };

  // One pass per item, ever. This is the retry guard and the answer to
  // persistent nagging at the same time: a duplicated request writes nothing,
  // and a proposal already waved away never comes back.
  if ((await repo.countSuggestionsForItem(db, itemId)) > 0) {
    return { status: "skipped", reason: "already_suggested" };
  }

  const vocabulary = await loadVocabulary(db, gaps);
  const classification = await classify({ title: item.title, gaps, vocabulary });
  if (!classification.ok) return { status: "failed", failure: classification.failure };

  const proposals = groundSuggestion(classification.suggestion, item, vocabulary, gaps);
  // The model answered, but nothing it said survived grounding — an invented
  // project, a kind outside the enum, tags nobody uses. Silence is the answer.
  if (proposals.length === 0) return { status: "skipped", reason: "nothing_grounded" };

  const count = await repo.insertSuggestions(
    db,
    proposals.map((proposal) => ({
      itemId,
      field: proposal.field,
      kind: proposal.kind,
      projectId: proposal.projectId,
      tagName: proposal.tagName,
      model: classification.model,
      // The title as the model saw it. If the item is retitled after this, every
      // proposal about it goes stale together — see `reconcileSuggestion`.
      observedTitle: item.title,
      observedValue: proposal.observedValue,
      createdAt: now,
    })),
  );

  return { status: "stored", count };
}

/**
 * Only what a gap actually needs.
 *
 * A capture that already has a project does not send the project list, and one
 * the user tagged does not send the tag list. The request carries the smallest
 * vocabulary that could answer the questions being asked.
 */
async function loadVocabulary(
  db: Database,
  gaps: { project: boolean; tags: boolean },
): Promise<SuggestionVocabulary> {
  const [projects, tags] = await Promise.all([
    gaps.project ? listSuggestibleProjectRefs(db, MAX_SUGGESTIBLE_PROJECTS) : [],
    gaps.tags ? listTagNamesByUsage(db, MAX_SUGGESTIBLE_TAGS) : [],
  ]);

  return { projects, tags };
}

/** What accepting turned out to mean, so the UI can say something true about it. */
export interface AcceptanceResult {
  outcome: SuggestionOutcome;
  itemId: string;
}

/**
 * Applying one proposal, if it still applies.
 *
 * The three outcomes are all successes. `superseded` in particular is the
 * feature working: the item moved on under a stale suggestion, so the proposal
 * is retired and **the item is not touched**. A newer manual choice always
 * survives an older automated one.
 *
 * Idempotent by two separate mechanisms, because a double-clicked button is not
 * an edge case: a non-pending row returns without acting, and every underlying
 * write is itself a no-op when the value is already there.
 */
export async function acceptSuggestion(
  db: Database,
  id: string,
  now = new Date(),
): Promise<AcceptanceResult> {
  const suggestion = await requireSuggestion(db, id);

  // Already accepted or dismissed. Report what it became rather than doing it
  // again — a second click must not add a second tag or re-file the item.
  if (suggestion.status !== "pending") {
    return {
      outcome: suggestion.status === "accepted" ? "redundant" : "superseded",
      itemId: suggestion.itemId,
    };
  }

  const item = await itemRepo.findItemById(db, suggestion.itemId);
  if (item === null) throw new NotFoundError("Item", suggestion.itemId);

  const outcome = reconcileSuggestion(suggestion, item);

  if (outcome === "applicable") await applyProposal(db, suggestion);

  // `redundant` is recorded as accepted because the item already says what was
  // proposed; only `superseded` is a retirement.
  await repo.resolveSuggestion(db, id, outcome === "superseded" ? "dismissed" : "accepted", now);

  return { outcome, itemId: suggestion.itemId };
}

/**
 * The one place a proposal reaches an item, and it does so through the ordinary
 * item service — the same functions the row menu and the editor use.
 */
async function applyProposal(db: Database, suggestion: ItemSuggestion): Promise<void> {
  if (suggestion.field === "kind" && suggestion.kind !== null) {
    await items.setItemKind(db, suggestion.itemId, suggestion.kind);
    return;
  }

  if (suggestion.field === "project" && suggestion.projectId !== null) {
    await items.setItemProject(db, suggestion.itemId, suggestion.projectId);
    return;
  }

  if (suggestion.field === "tag" && suggestion.tagName !== null) {
    await items.addItemTag(db, suggestion.itemId, suggestion.tagName);
  }
}

export async function dismissSuggestion(
  db: Database,
  id: string,
  now = new Date(),
): Promise<{ itemId: string }> {
  const suggestion = await requireSuggestion(db, id);
  await repo.resolveSuggestion(db, id, "dismissed", now);
  return { itemId: suggestion.itemId };
}

/** "Not now" for a whole row, so ignoring the lot costs one click. */
export async function dismissItemSuggestions(
  db: Database,
  itemId: string,
  now = new Date(),
): Promise<number> {
  return repo.dismissPendingForItem(db, itemId, now);
}

/**
 * Pending proposals for a list of items, keyed by item.
 *
 * A map rather than a flat list because every caller is rendering rows and
 * would otherwise group it themselves. Items with nothing pending are simply
 * absent — which is the state of every item when AI is not configured.
 */
export async function listPendingSuggestionsByItem(
  db: Database,
  itemIds: readonly string[],
): Promise<Map<string, ItemSuggestionView[]>> {
  const rows = await repo.listPendingSuggestions(db, itemIds);
  const grouped = new Map<string, ItemSuggestionView[]>();

  for (const row of rows) {
    const existing = grouped.get(row.itemId);
    if (existing) existing.push(row);
    else grouped.set(row.itemId, [row]);
  }

  return grouped;
}

export async function listPendingSuggestionsForItem(
  db: Database,
  itemId: string,
): Promise<ItemSuggestionView[]> {
  return repo.listPendingSuggestions(db, [itemId]);
}

async function requireSuggestion(db: Database, id: string): Promise<ItemSuggestion> {
  const suggestion = await repo.findSuggestionById(db, id);
  if (!suggestion) throw new NotFoundError("Suggestion", id);
  return suggestion;
}
