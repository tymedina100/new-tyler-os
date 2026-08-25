"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { addToShoppingListAction } from "@/server/actions/inventory-actions";

/**
 * Adding a line to the shopping list.
 *
 * The text goes through the ordinary capture path, so `#tags` and `@project`
 * still work here and there is still exactly one way an item is created.
 * Quantities live in the text — "2 gal milk" is how a shopping list is written
 * by hand, and it is enough.
 */
export function ShoppingAdd({ defaultName }: { defaultName?: string | undefined }) {
  const [state, formAction, isPending] = useActionState(addToShoppingListAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state]);

  const error = state && !state.ok ? (state.fieldErrors?.name?.[0] ?? state.error) : null;

  return (
    <form ref={formRef} action={formAction} className="mb-4 grid gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          name="name"
          defaultValue={defaultName ?? ""}
          placeholder="Add to the shopping list…"
          aria-label="Shopping item"
          autoComplete="off"
          maxLength={120}
        />
        <Button type="submit" variant="primary" disabled={isPending}>
          <Plus aria-hidden />
          {isPending ? "Adding" : "Add"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-destructive px-1 text-xs">
          {error}
        </p>
      ) : null}
    </form>
  );
}
