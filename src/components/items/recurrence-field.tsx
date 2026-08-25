import { Field, Input, Select } from "@/components/ui/field";
import type { ItemRecurrence, RecurrenceFrequency } from "@/domain/recurrence/recurrence";
import {
  describeRecurrence,
  MAX_RECURRENCE_INTERVAL,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_FREQUENCY_LABELS,
} from "@/domain/recurrence/recurrence";
import { NO_RECURRENCE } from "@/domain/recurrence/recurrence-schema";
import { resolveAnchor } from "@/domain/recurrence/recurrence-rules";
import { formatDueDate, type IsoDate } from "@/domain/shared/date";

/**
 * How an item repeats, in two controls.
 *
 * A frequency and a count is the whole model, so it is the whole form. There is
 * no weekday picker and no "on the last working day of the month", because the
 * date field above already carries which Tuesday this is — which is exactly why
 * the sentence underneath spells that out. "Every 2 weeks" is not something
 * anybody should have to trust without being told which Tuesday it means.
 *
 * The description is computed with `resolveAnchor`, the same rule the server
 * applies on save, so the preview cannot promise a schedule the server will not
 * keep. That is the pattern ADR 017 established for the capture bar.
 */
export function RecurrenceField({
  existing,
  existingDueOn,
  frequency,
  interval,
  dueOn,
  today,
  onFrequencyChange,
  onIntervalChange,
  errors,
}: {
  existing: ItemRecurrence | null;
  existingDueOn: IsoDate | null;
  frequency: RecurrenceFrequency | typeof NO_RECURRENCE;
  interval: string;
  /** The live value of the date field, so the sentence follows what is typed. */
  dueOn: string;
  today: IsoDate;
  onFrequencyChange: (value: RecurrenceFrequency | typeof NO_RECURRENCE) => void;
  onIntervalChange: (value: string) => void;
  errors?: string[];
}) {
  const repeats = frequency !== NO_RECURRENCE;

  const anchorOn = resolveAnchor(
    existing && { anchorOn: existing.anchorOn, dueOn: existingDueOn },
    dueOn.length > 0 ? dueOn : today,
  );

  const description = repeats
    ? describeRecurrence({
        frequency,
        interval: Number(interval) > 0 ? Number(interval) : 1,
        anchorOn,
        lastCompletedOn: null,
      })
    : null;

  return (
    <div className="grid gap-1.5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Repeats" htmlFor="recurrenceFrequency" errors={errors}>
          <Select
            id="recurrenceFrequency"
            name="recurrenceFrequency"
            value={frequency}
            onChange={(event) =>
              onFrequencyChange(event.target.value as RecurrenceFrequency | typeof NO_RECURRENCE)
            }
          >
            <option value={NO_RECURRENCE}>Does not repeat</option>
            {RECURRENCE_FREQUENCIES.map((value) => (
              <option key={value} value={value}>
                {RECURRENCE_FREQUENCY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        {repeats ? (
          <Field label="Every" htmlFor="recurrenceInterval">
            <Input
              id="recurrenceInterval"
              name="recurrenceInterval"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_RECURRENCE_INTERVAL}
              value={interval}
              onChange={(event) => onIntervalChange(event.target.value)}
            />
          </Field>
        ) : null}
      </div>

      {description ? (
        <p className="text-muted-foreground text-xs">
          {description}. Completing it moves it to the next one.
          {existing?.lastCompletedOn
            ? ` Last done: ${formatDueDate(existing.lastCompletedOn, today)}.`
            : null}
        </p>
      ) : null}
    </div>
  );
}
