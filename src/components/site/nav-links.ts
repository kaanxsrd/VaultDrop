export const MAIN_NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/docs", label: "Developers" },
  { href: "/pricing", label: "Pricing" },
] as const;

export const FOOTER_NAV = [
  {
    title: "Product",
    links: [
      { href: "/", label: "Share a secret" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs/api", label: "API reference" },
      { href: "/api/v1/openapi.json", label: "OpenAPI spec" },
      { href: "/status", label: "Status" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/security", label: "Security" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/contact", label: "Contact" },
    ],
  },
] as const;
