"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { signOutAction } from "@/server/actions/auth-actions";

/**
 * Ends the session and returns to `/login`.
 *
 * `router.push` rather than the server action redirecting: signing out is a
 * mutation, and the rule every other action follows — no `redirect()` inside
 * an action body — applies here too, even though this one is not wrapped in
 * `runAction`. See `src/server/actions/auth-actions.ts`.
 */
export function SignOutButton({ className }: { className?: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function signOut() {
    startTransition(async () => {
      const result = await signOutAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push("/login");
    });
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={isPending}
      className={cn(
        "text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors disabled:opacity-50",
        className,
      )}
    >
      <LogOut aria-hidden className="size-4 shrink-0" />
      <span>{isPending ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}
