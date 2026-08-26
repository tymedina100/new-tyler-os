import type { MetadataRoute } from "next";

/**
 * Makes TylerOS installable to a phone's home screen.
 *
 * `start_url: "/"` even though every route requires a session: opening an
 * installed app and landing on `/login` (via `src/proxy.ts`, same as any
 * other visit) is exactly what should happen signed out, and exactly what a
 * generic "always start here" URL is for. There is no separate installed-app
 * routing concept to maintain.
 *
 * One icon, purpose `"any"`, not a maskable-optimised set — see
 * docs/DECISIONS.md ADR 031 for why that is enough for a one-person app and
 * not a corner this milestone is trying to finish.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TylerOS",
    short_name: "TylerOS",
    description: "A private personal-life operating system.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfbfc",
    theme_color: "#096acb",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
