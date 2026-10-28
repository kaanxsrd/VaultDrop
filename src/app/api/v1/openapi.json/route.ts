import { buildOpenApi } from "@/lib/openapi";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(buildOpenApi(env().APP_URL), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
