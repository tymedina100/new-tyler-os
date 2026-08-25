"use client";

import { useEffect } from "react";

/**
 * The root layout itself failed, which means the shell could not be rendered.
 * This replaces the whole document, so it carries its own minimal styling.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error("[tyleros] global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "#17181c",
          color: "#e9eaee",
        }}
      >
        <main style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>TylerOS could not start.</h1>
          <p style={{ margin: "0 0 0.75rem", color: "#a0a3ad", lineHeight: 1.5 }}>
            The application shell failed to render. This almost always means the database is
            unreachable — check that Postgres is running and that DATABASE_URL in .env is correct.
          </p>
          {error.digest ? (
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                color: "#a0a3ad",
              }}
            >
              Digest: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
