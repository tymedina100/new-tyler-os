"use client";

import { FolderGit2, Hash, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { ITEM_KIND_LABELS } from "@/domain/items/item";
import type { ItemSuggestionView } from "@/domain/suggestions/suggestion";
import type { SuggestionOutcome } from "@/domain/suggestions/suggestion-rules";
import {
  acceptSuggestionAction,
  dismissItemSuggestionsAction,
  dismissSuggestionAction,
} from "@/server/actions/suggestion-actions";
import { cn } from "@/lib/cn";

/**
 * What AI proposed about an item, offered rather than applied.
 *
 * The entire visual argument of this component is the **dashed border**. Every
 * badge elsewhere in TylerOS is solid, and solid means the system knows this —
 * from `@project`, from `#tag`, from a date the user typed, or from a decision
 * they made in the editor. Dashed means somebody guessed. A person glancing at
 * a row should never have to work out which of the two they are looking at, and
 * one border style does that without a colour, a label on every chip, or an
 * icon that makes a personal organiser look like a chat product.
 *
 * There is no sparkle, no gradient, no "AI" branding and no accent colour. This
 * is muted text inside a dashed outline, sitting under the row it belongs to. If
 * it is ignored it costs a line of grey; that is the intended default.
 *
 * Clicking a chip accepts that one proposal. Nothing here is atomic: accepting
 * the project has no opinion about the tags, which is the point — the server
 * reconciles each proposal on its own against the item as it stands at that
 * moment.
 */
export function ItemSuggestions({
  itemId,
  suggestions,
}: {
  itemId: string;
  suggestions: readonly ItemSuggestionView[];
}) {
  const [isPending, startTransition] = useTransition();

  if (suggestions.length === 0) return null;

  function accept(suggestion: ItemSuggestionView) {
    startTransition(async () => {
      const result = await acceptSuggestionAction(suggestion.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(acceptanceMessage(result.data.outcome, suggestion));
    });
  }

  function dismiss(id: string) {
    startTransition(async () => {
      const result = await dismissSuggestionAction(id);
      if (!result.ok) toast.error(result.error);
    });
  }

  function dismissAll() {
    startTransition(async () => {
      const result = await dismissItemSuggestionsAction(itemId);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div
      className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-[0.6875rem]"
      aria-label="Suggestions"
    >
      {/*
        Said once for the row rather than repeated on every chip. The dashed
        outline is what carries the meaning after the first glance; this is here
        so the first glance has a word to attach it to.
      */}
      <span className="font-medium">Suggested</span>

      {suggestions.map((suggestion) => (
        <span
          key={suggestion.id}
          className={cn(
            "border-border/70 inline-flex items-center rounded border border-dashed",
            "focus-within:border-input transition-opacity",
            isPending && "opacity-50",
          )}
        >
          <button
            type="button"
            onClick={() => accept(suggestion)}
            disabled={isPending}
            aria-label={acceptLabel(suggestion)}
            className="hover:text-foreground inline-flex items-center gap-1 rounded-l py-1 pr-1 pl-1.5 leading-none font-medium transition-colors disabled:cursor-not-allowed"
          >
            <SuggestionIcon suggestion={suggestion} />
            {describe(suggestion)}
          </button>

          {/*
            Quiet until wanted. Ignoring a suggestion should be the cheapest
            thing on the row, but it still has to be reachable by keyboard and
            hittable on a phone, so it is always rendered and always focusable
            rather than appearing on hover.
          */}
          <button
            type="button"
            onClick={() => dismiss(suggestion.id)}
            disabled={isPending}
            aria-label={`Dismiss suggestion: ${describe(suggestion)}`}
            className="text-muted-foreground/50 hover:text-foreground focus-visible:text-foreground rounded-r px-1 py-1 transition-colors disabled:cursor-not-allowed"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={dismissAll}
        disabled={isPending}
        className="hover:text-foreground rounded px-1 py-0.5 underline underline-offset-2 transition-colors disabled:cursor-not-allowed"
      >
        Not now
      </button>
    </div>
  );
}

function SuggestionIcon({ suggestion }: { suggestion: ItemSuggestionView }) {
  // The same icons the real badges use, so a chip reads as the thing it would
  // become. The border is what says it has not become it yet.
  if (suggestion.field === "project") return <FolderGit2 aria-hidden className="size-3" />;
  if (suggestion.field === "tag") return <Hash aria-hidden className="size-3" />;
  return null;
}

function describe(suggestion: ItemSuggestionView): string {
  if (suggestion.field === "kind") {
    return suggestion.kind === null ? "Type" : ITEM_KIND_LABELS[suggestion.kind];
  }
  if (suggestion.field === "project") return suggestion.project?.name ?? "Project";
  return suggestion.tagName ?? "Tag";
}

function acceptLabel(suggestion: ItemSuggestionView): string {
  if (suggestion.field === "kind") return `Set type to ${describe(suggestion)}`;
  if (suggestion.field === "project") return `File under ${describe(suggestion)}`;
  return `Add the tag ${describe(suggestion)}`;
}

/**
 * Saying what actually happened, which is not always what was asked for.
 *
 * `superseded` is the message that earns this function. The suggestion was
 * stale — the user had already chosen something else — so nothing changed, and
 * a plain "Saved" there would be a lie about their own data. Telling them their
 * choice was kept is the whole trust proposition of a system that lets a model
 * propose things.
 */
function acceptanceMessage(outcome: SuggestionOutcome, suggestion: ItemSuggestionView): string {
  if (outcome === "superseded") return "Kept your own choice — that suggestion was out of date.";
  if (outcome === "redundant") return `Already set to ${describe(suggestion)}.`;

  if (suggestion.field === "kind") return `Set to ${describe(suggestion)}.`;
  if (suggestion.field === "project") return `Filed under ${describe(suggestion)}.`;
  return `Tagged ${describe(suggestion)}.`;
}
