"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { signInAction } from "@/server/actions/auth-actions";

/**
 * The one form TylerOS shows to someone with no session.
 *
 * Client-side navigation after success, not a `redirect()` inside the action —
 * the same rule every other action follows, and for the same reason: a
 * redirect works by throwing, which `runAction`-style error handling would
 * swallow. `signInAction` does not use `runAction`, but keeping the same shape
 * everywhere means one thing to remember, not two.
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState(signInAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.push(next ?? "/");
  }, [state, next, router]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !state.fieldErrors ? state.error : null;

  return (
    <form action={formAction} className="grid gap-4">
      <Field label="Passphrase" htmlFor="passphrase" errors={fieldErrors?.passphrase}>
        {/* h-11: the shared Input default (h-9, 36px) is under the 44px tap
            floor, found by measuring at 375px. This is the first control
            anyone signed out ever taps, so it gets the floor on its own
            rather than raising it for every form in the app. */}
        <Input
          id="passphrase"
          name="passphrase"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className="h-11"
        />
      </Field>

      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {formError}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={isPending} className="h-11">
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
