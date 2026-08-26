"use client";

import { useState } from "react";
import { RecurrenceField } from "@/components/items/recurrence-field";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  ITEM_KIND_LABELS,
  ITEM_KINDS,
  ITEM_STATUS_LABELS,
  ITEM_STATUSES,
  type ItemWithRelations,
} from "@/domain/items/item";
import { MAX_TAGS_PER_ITEM } from "@/domain/items/item-schema";
import type { RecurrenceFrequency } from "@/domain/recurrence/recurrence";
import { NO_RECURRENCE } from "@/domain/recurrence/recurrence-schema";
import type { IsoDate } from "@/domain/shared/date";
import type { FieldErrors } from "@/server/action-result";

/**
 * The editable fields of an item — the local draft.
 *
 * Separate from `ItemForm` for one reason: this component **is** the draft, so
 * the draft can be discarded and re-seeded by remounting it, and only when the
 * parent has decided that is safe. Every uncontrolled `defaultValue` here reads
 * from the `item` prop, so a remount shows the canonical persisted values and
 * nothing else needs to know how to reset a field.
 *
 * The three pieces of state are here rather than in the parent for the same
 * reason: they are draft, not persisted, and they must be re-seeded together
 * with the fields they describe.
 */
export function ItemFields({
  item,
  projects,
  today,
  fieldErrors,
}: {
  /** The persisted snapshot this draft was seeded from. */
  item: ItemWithRelations;
  projects: readonly { id: string; name: string }[];
  /** From the server, so the repeat preview cannot disagree about the date. */
  today: IsoDate;
  fieldErrors?: FieldErrors;
}) {
  // Mirrored, not controlled: the date input keeps whatever was typed before
  // hydration, and the repeat description still follows it. See 0.2's recorded
  // result in docs/VERIFICATION.md for what controlling it costs.
  const [dueOn, setDueOn] = useState(item.dueOn ?? "");
  const [frequency, setFrequency] = useState<RecurrenceFrequency | typeof NO_RECURRENCE>(
    item.recurrence?.frequency ?? NO_RECURRENCE,
  );
  const [interval, setInterval] = useState(String(item.recurrence?.interval ?? 1));

  // A repeating item is never finished, only its current occurrence is. Offering
  // "Done" here would be offering something the server is right to refuse.
  const statuses = ITEM_STATUSES.filter(
    (status) => frequency === NO_RECURRENCE || status !== "done",
  );

  return (
    <>
      <Field label="Title" htmlFor="title" errors={fieldErrors?.title}>
        <Input id="title" name="title" defaultValue={item.title} required maxLength={280} />
      </Field>

      <Field label="Notes" htmlFor="body" errors={fieldErrors?.body}>
        <Textarea id="body" name="body" defaultValue={item.body ?? ""} rows={5} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="kind" errors={fieldErrors?.kind}>
          <Select id="kind" name="kind" defaultValue={item.kind}>
            {ITEM_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {ITEM_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Status" htmlFor="status" errors={fieldErrors?.status}>
          <Select id="status" name="status" defaultValue={item.status}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {ITEM_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Due" htmlFor="dueOn" errors={fieldErrors?.dueOn}>
          <Input
            id="dueOn"
            name="dueOn"
            type="date"
            defaultValue={item.dueOn ?? ""}
            onChange={(event) => setDueOn(event.target.value)}
          />
        </Field>

        <Field label="Project" htmlFor="projectId" errors={fieldErrors?.projectId}>
          <Select id="projectId" name="projectId" defaultValue={item.projectId ?? "none"}>
            <option value="none">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <RecurrenceField
        existing={item.recurrence}
        existingDueOn={item.dueOn}
        frequency={frequency}
        interval={interval}
        dueOn={dueOn}
        today={today}
        onFrequencyChange={setFrequency}
        onIntervalChange={setInterval}
        errors={fieldErrors?.recurrence}
      />

      <Field
        label="Tags"
        htmlFor="tags"
        hint={`Space or comma separated. Up to ${MAX_TAGS_PER_ITEM}.`}
        errors={fieldErrors?.tags}
      >
        <Input
          id="tags"
          name="tags"
          defaultValue={item.tags.map((tag) => tag.name).join(" ")}
          placeholder="home errand"
        />
      </Field>
    </>
  );
}
