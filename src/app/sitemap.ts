import type { MetadataRoute } from "next";

const PUBLIC = [
  "",
  "/how-it-works",
  "/security",
  "/pricing",
  "/docs",
  "/docs/api",
  "/changelog",
  "/status",
  "/privacy",
  "/terms",
  "/contact",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return PUBLIC.map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "monthly",
    priority: p === "" ? 1 : 0.6,
  }));
}
