import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), clipboard-write=(self)",
  },
];

/** Pages that handle link keys or receipt tokens must never be cached, indexed or embedded. */
const sensitiveHeaders = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  // The Docker image sets NEXT_OUTPUT=standalone; `next start` is used everywhere else.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  serverExternalPackages: [
    "@electric-sql/pglite",
    "@node-rs/argon2",
    "pino",
    "postgres",
    "ioredis",
    "nodemailer",
  ],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/s/:path*", headers: sensitiveHeaders },
      { source: "/receipt/:path*", headers: sensitiveHeaders },
      { source: "/dashboard/:path*", headers: sensitiveHeaders },
      { source: "/admin/:path*", headers: sensitiveHeaders },
    ];
  },
};

export default nextConfig;
