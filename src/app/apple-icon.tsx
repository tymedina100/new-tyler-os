import { ImageResponse } from "next/og";

/**
 * The iOS home-screen icon. iOS does not read the web manifest's `icons`
 * array at all — it looks for exactly this file convention — so this exists
 * even though it renders the identical mark as `src/app/icon.tsx`. iOS adds
 * its own corner mask, so this stays a plain, fully opaque square: no
 * transparency, which iOS would otherwise fill in with black.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
      <span style={{ color: "#ffffff", fontSize: 105, fontWeight: 700 }}>T</span>
    </div>,
    { ...size },
  );
}
