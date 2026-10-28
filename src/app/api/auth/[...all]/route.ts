import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

const handlers = () => toNextJsHandler(getAuth());

export async function GET(req: Request) {
  await getDb();
  return handlers().GET(req);
}

export async function POST(req: Request) {
  await getDb();
  return handlers().POST(req);
}
