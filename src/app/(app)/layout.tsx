import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { CaptureBar } from "@/components/shell/capture-bar";
import { CommandPalette } from "@/components/shell/command-palette";
import { MobileNav, SidebarNav } from "@/components/shell/nav";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { todayIsoDate } from "@/domain/shared/date";
import { getDb } from "@/server/db/client";
import { countItemsByStatus } from "@/server/items/item-service";
import { listProjectRefs } from "@/server/projects/project-repository";
import "../globals.css";

/**
 * TylerOS renders live personal data, so nothing is prerendered. This also
 * means `next build` never needs a database connection.
 *
 * This is the root layout for the `(app)` route group — every authenticated
 * screen. `src/proxy.ts` has already turned away any request that reached this
 * far without a valid session, so the query below runs only for someone who is
 * signed in. `/login` has its own, deliberately bare, root layout: see
 * `src/app/(auth)/layout.tsx` and docs/DECISIONS.md ADR 030.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "TylerOS", template: "%s · TylerOS" },
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const db = getDb();
  // The capture bar previews what it will parse, so it needs the same projects
  // and the same reference date the server will use. Today comes from here
  // rather than the browser: the two would disagree across a timezone.
  const [counts, projects] = await Promise.all([countItemsByStatus(db), listProjectRefs(db)]);
  const today = todayIsoDate(new Date());

  return (
    <html lang="en">
      <body className="min-h-dvh">
        <div className="mx-auto flex min-h-dvh w-full max-w-6xl">
          <aside className="border-border sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-6 border-r px-3 py-5 md:flex">
            <div className="px-2.5">
              <p className="font-mono text-sm font-semibold tracking-tight">TylerOS</p>
              <p className="text-muted-foreground text-xs">Personal operating system</p>
            </div>

            <SidebarNav inboxCount={counts.inbox} />

            <div className="mt-auto grid gap-3">
              <dl className="text-muted-foreground grid gap-1 px-2.5 text-xs">
                <div className="flex justify-between">
                  <dt>Open</dt>
                  <dd className="tabular-nums">{counts.inbox + counts.active + counts.someday}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Done</dt>
                  <dd className="tabular-nums">{counts.done}</dd>
                </div>
              </dl>

              <SignOutButton />
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-border bg-background/90 sticky top-0 z-30 border-b px-4 py-3 backdrop-blur md:px-6">
              <CaptureBar today={today} projects={projects} />
            </div>

            <main className="flex-1 px-4 pt-5 pb-24 md:px-6 md:pb-10">{children}</main>
          </div>
        </div>

        <MobileNav inboxCount={counts.inbox} />
        <CommandPalette />
        <Toaster position="bottom-right" toastOptions={{ className: "font-sans text-sm" }} />
      </body>
    </html>
  );
}
