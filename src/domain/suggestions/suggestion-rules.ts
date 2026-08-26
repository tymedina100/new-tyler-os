import { isItemKind, type ItemKind, type ItemStatus } from "@/domain/items/item";
import { MAX_TAGS_PER_ITEM } from "@/domain/items/item-schema";
import type { ProjectRef } from "@/domain/projects/project";
import { normalizeTagName } from "@/domain/tags/tag";
import type { ItemSuggestion, SuggestionProposal } from "./suggestion";

/**
 * The rules that keep a proposer from becoming an author.
 *
 * Three pure functions, in the order they run:
 *
 *   1. `suggestionGaps`      — what is even worth asking about
 *   2. `groundSuggestion`    — turn whatever came back into proposals that exist
 *   3. `reconcileSuggestion` — decide, at acceptance time, whether it still holds
 *
 * All three are pure, so the interesting behaviour of TylerOS's first
 * non-deterministic subsystem is tested without a database, a network or a
 * model. The provider call is the only part that is not, and it is the only
 * part that lives in `src/server/ai/`.
 */

/**
 * At most three tag proposals.
 *
 * Not a technical limit — a manners one. A row offering eight tags is a
 * negotiation, and the point of this feature is that ignoring it costs nothing.
 */
export const MAX_TAG_SUGGESTIONS = 3;

/** The parts of an item any of these rules look at. */
export interface SuggestibleItem {
  title: string;
  kind: ItemKind;
  status: ItemStatus;
  projectId: string | null;
  tags: readonly { name: string }[];
}

/** What the model is allowed to choose from. Nothing else is ever grounded. */
export interface SuggestionVocabulary {
  projects: readonly ProjectRef[];
  tags: readonly string[];
}

/**
 * Which fields a suggestion may speak about at all.
 *
 * This is the deterministic-wins rule, implemented by **omission** rather than
 * by arbitration. A value the capture parser resolved is never in the request,
 * so there is no later moment where a model's answer and the user's own syntax
 * have to be reconciled — the model was never asked.
 *
 * Nothing is suggested once an item has left the inbox. `initialCaptureStatus`
 * already treats capturing into a project as an act of triage, and an item the
 * user has filed is one they have decided about. Suggesting into that is not
 * filling a gap, it is second-guessing.
 */
export interface SuggestionGaps {
  kind: boolean;
  project: boolean;
  tags: boolean;
}

export function suggestionGaps(item: SuggestibleItem): SuggestionGaps {
  if (item.status !== "inbox") return { kind: false, project: false, tags: false };

  return {
    // Capture has no syntax for a kind, so an untriaged item's kind is always
    // the default rather than a decision. Triage is exactly where that changes.
    kind: true,
    project: item.projectId === null,
    // An explicit `#tag` means the user is tagging deliberately. Adding one
    // they did not ask for is not filling a gap.
    tags: item.tags.length === 0,
  };
}

export function hasAnyGap(gaps: SuggestionGaps): boolean {
  return gaps.kind || gaps.project || gaps.tags;
}

/** Whatever came back, after JSON validation and before it means anything. */
export interface RawSuggestion {
  kind: string | null;
  project: string | null;
  tags: readonly string[];
}

/**
 * Turning a validated response into proposals that refer to things that exist.
 *
 * Everything that cannot be grounded is dropped silently, and dropping is
 * always the safe direction: a suggestion that never appears costs the user
 * nothing, where one naming a project that does not exist is a bug with a UI.
 *
 * In particular this never invents vocabulary. An unknown project name is not a
 * new project, an unknown tag is not a new tag, and a kind outside the enum is
 * not a kind. The model chooses from a list it was given, or it is ignored.
 */
export function groundSuggestion(
  raw: RawSuggestion,
  item: SuggestibleItem,
  vocabulary: SuggestionVocabulary,
  gaps: SuggestionGaps,
): SuggestionProposal[] {
  const proposals: SuggestionProposal[] = [];

  if (gaps.kind && raw.kind !== null) {
    const kind = raw.kind.trim().toLowerCase();
    // Proposing the kind an item already has is a no-op dressed as advice.
    if (isItemKind(kind) && kind !== item.kind) {
      proposals.push({
        field: "kind",
        kind,
        projectId: null,
        tagName: null,
        observedValue: item.kind,
      });
    }
  }

  if (gaps.project && raw.project !== null) {
    const project = matchProjectName(raw.project, vocabulary.projects);
    if (project !== null) {
      proposals.push({
        field: "project",
        kind: null,
        projectId: project.id,
        tagName: null,
        // The project was empty when this was proposed. Storing that is what
        // lets a manual choice made in the meantime win at acceptance time.
        observedValue: "",
      });
    }
  }

  if (gaps.tags) {
    const allowed = new Set(vocabulary.tags);
    const held = new Set(item.tags.map((tag) => tag.name));
    const seen = new Set<string>();
    // Room is measured against what the item already holds, so accepting every
    // proposal can never push it past the limit the editor enforces.
    const room = Math.min(MAX_TAG_SUGGESTIONS, MAX_TAGS_PER_ITEM - item.tags.length);

    for (const candidate of raw.tags) {
      if (seen.size >= room) break;

      const name = normalizeTagName(candidate);
      // Normalisation collapses "#Home" and "home", so de-duplication has to
      // happen after it rather than on whatever the model wrote.
      if (name.length === 0 || seen.has(name) || held.has(name) || !allowed.has(name)) continue;

      seen.add(name);
      proposals.push({
        field: "tag",
        kind: null,
        projectId: null,
        tagName: name,
        observedValue: "",
      });
    }
  }

  return proposals;
}

/**
 * Only an exact name matches, ignoring case and surrounding space.
 *
 * Deliberately stricter than `matchProjectRef`, which resolves a prefix a human
 * typed. A model was handed the exact list; a near-miss from it is a mistake
 * rather than an abbreviation, and guessing at one is how an item ends up in
 * the wrong project with nobody able to say why.
 */
function matchProjectName(raw: string, projects: readonly ProjectRef[]): ProjectRef | null {
  const wanted = raw.trim().toLowerCase();
  if (wanted.length === 0) return null;

  return projects.find((project) => project.name.trim().toLowerCase() === wanted) ?? null;
}

/**
 * What accepting a proposal should actually do, given the item as it stands now.
 *
 *   - `applicable` — apply it
 *   - `redundant`  — the item already says this; resolve it, change nothing
 *   - `superseded` — the item moved on; resolve it, change nothing
 *
 * The distinction that matters is the last one. A proposal carries the value
 * its field held when the proposal was made, so if the user has since chosen
 * something else, accepting a stale suggestion cannot undo the newer choice.
 *
 * That check is per proposal rather than per response, which is what lets a
 * user accept the project and still act on the tags afterwards. Accepting one
 * proposal changes the item, so a whole-response signature would stale every
 * sibling the moment the first one was accepted.
 */
export type SuggestionOutcome = "applicable" | "redundant" | "superseded";

export function reconcileSuggestion(
  suggestion: Pick<
    ItemSuggestion,
    "field" | "kind" | "projectId" | "tagName" | "observedTitle" | "observedValue"
  >,
  item: SuggestibleItem,
): SuggestionOutcome {
  // A retitled item is a different capture. Whatever was proposed was proposed
  // about words that are no longer there.
  if (item.title !== suggestion.observedTitle) return "superseded";

  if (suggestion.field === "kind") {
    if (suggestion.kind === null) return "superseded";
    if (item.kind === suggestion.kind) return "redundant";
    return item.kind === suggestion.observedValue ? "applicable" : "superseded";
  }

  if (suggestion.field === "project") {
    if (suggestion.projectId === null) return "superseded";
    if (item.projectId === suggestion.projectId) return "redundant";
    return (item.projectId ?? "") === suggestion.observedValue ? "applicable" : "superseded";
  }

  if (suggestion.tagName === null) return "superseded";
  // Tags are additive, so there is no value to have been overwritten and no
  // `observedValue` to compare against. The only ways a tag proposal stops
  // applying are that the tag is already there, or that there is no room left.
  if (item.tags.some((tag) => tag.name === suggestion.tagName)) return "redundant";
  return item.tags.length >= MAX_TAGS_PER_ITEM ? "superseded" : "applicable";
}
