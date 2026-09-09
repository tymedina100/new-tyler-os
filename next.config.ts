import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Separate local verification builds from the daily-use development server.
  distDir: process.env.TYLEROS_MOBILE_E2E === "1" ? ".next-mobile-e2e" : ".next",
  // Nothing about this app needs announcing to anyone.
  poweredByHeader: false,

  // The static/dynamic route badge has nothing to tell this app: every route
  // is already `dynamic = "force-dynamic"` by design (docs/ARCHITECTURE.md).
  // Its default position also sits directly under the phone-width bottom nav
  // added in 0.7, which is worth avoiding even setting that aside.
  devIndicators: false,

  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];

    // HSTS only makes sense once the app is actually reached over HTTPS —
    // sending it in development, over plain http://localhost, would just be
    // a header nobody's browser can act on.
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      });
    }

    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
