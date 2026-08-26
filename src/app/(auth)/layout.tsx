import type { Metadata, Viewport } from "next";
import "../globals.css";

/**
 * The bare root layout for `/login`.
 *
 * A second root layout, not a branch inside the first: `(app)/layout.tsx`
 * queries the database for sidebar counts and project names on every render,
 * and renders the capture bar, the nav, and the command palette — none of
 * which an unauthenticated visitor should see or which should depend on being
 * signed in to render. Next's own convention for "a route needs a different
 * `<html>`/`<body>` than the rest of the app" is exactly this: two route
 * groups, each its own root layout. See docs/ARCHITECTURE.md and ADR 030.
 *
 * `dynamic = "force-dynamic"` is not set here on purpose: this layout makes no
 * database call and reads no cookie itself, so it has nothing dynamic to
 * declare. The login page below it does that.
 */

export const metadata: Metadata = {
  title: { default: "Sign in", template: "%s · TylerOS" },
  description: "A private personal-life operating system.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "TylerOS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#17181c" },
  ],
};

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
