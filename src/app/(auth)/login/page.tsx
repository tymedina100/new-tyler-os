import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LoginForm } from "@/components/shell/login-form";
import { readParam } from "@/lib/search-params";
import { authConfig } from "@/server/auth/auth-config";
import { hasValidSession } from "@/server/auth/session-cookie";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

/**
 * `/login`. Reachable with no session — see `src/server/auth/public-routes.ts`
 * — and the only route this application has that must work that way.
 */
export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = safeNextPath(readParam(params.next));
  const config = authConfig();

  if (config.mode === "misconfigured") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="font-mono text-sm font-semibold tracking-tight">TylerOS</p>
        <h1 className="text-lg font-semibold">Not configured</h1>
        <p className="text-muted-foreground text-sm">{config.problems[0]}</p>
      </main>
    );
  }

  // Already signed in, or nothing to sign into: send them where they meant to
  // go rather than showing a form with nothing useful to do.
  if (await hasValidSession(new Date().getTime())) {
    redirect(next ?? "/");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <p className="font-mono text-sm font-semibold tracking-tight">TylerOS</p>
        <h1 className="mt-1 text-lg font-semibold">Sign in</h1>
      </div>
      <LoginForm next={next} />
    </main>
  );
}

/**
 * Only ever a same-origin relative path. `next` arrives from a query string an
 * attacker can craft, and this is what stops it becoming an open redirect.
 */
function safeNextPath(value: string | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}
