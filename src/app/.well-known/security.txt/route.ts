import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/** RFC 9116 security.txt */
export function GET() {
  const expires = new Date(Date.now() + 180 * 86_400_000).toISOString();
  const body = [
    `Contact: mailto:${env().SECURITY_EMAIL}`,
    `Expires: ${expires}`,
    `Policy: ${env().APP_URL}/security`,
    "Preferred-Languages: en",
    `Canonical: ${env().APP_URL}/.well-known/security.txt`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
