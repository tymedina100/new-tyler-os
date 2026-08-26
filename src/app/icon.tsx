import { ImageResponse } from "next/og";

/**
 * The one mark TylerOS has: a white "T" on the app's own accent colour
 * (`--primary` from `src/app/globals.css`, converted to sRGB since this
 * renders outside any stylesheet). Generated once at build time, not stored
 * as a binary asset — there is nothing to keep in sync with the theme this
 * way, and no image-editing round trip for a one-letter mark.
 *
 * This route also becomes the browser tab icon: Next injects the `<link
 * rel="icon">` for any `icon.(tsx|ts|jsx|js)` file automatically. See
 * `src/app/apple-icon.tsx` for the iOS home-screen equivalent and
 * `src/app/manifest.ts`, which points its own icon entry at this same route.
 */

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#096acb",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      }}
    >
      <span style={{ color: "#ffffff", fontSize: 300, fontWeight: 700 }}>T</span>
    </div>,
    { ...size },
  );
}
