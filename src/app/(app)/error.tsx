"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Route-level failures. The message is deliberately concrete: on a personal
 * machine the overwhelmingly likely cause is that Postgres is not running, and
 * saying so beats a generic apology.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[tyleros] route error", error);
  }, [error]);

  return (
    <div className="border-destructive/30 bg-card grid gap-3 rounded-xl border p-6">
      <h1 className="text-base font-semibold">This screen could not load.</h1>
      <p className="text-muted-foreground text-sm">
        If TylerOS was working a moment ago, the database is the usual suspect. Start it with{" "}
        <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">docker compose up -d</code>{" "}
        and try again.
      </p>
      {error.digest ? (
        <p className="text-muted-foreground font-mono text-xs">Digest: {error.digest}</p>
      ) : null}
      <div>
        <Button variant="primary" size="sm" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
