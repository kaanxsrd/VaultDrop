import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { errorInfo, logger, safeUrlPath } from "@/server/log";

const BASE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export interface RouteContext<P> {
  req: Request;
  params: P;
  requestId: string;
}

export function json(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { ...BASE_HEADERS, ...init.headers },
  });
}

function errorResponse(error: AppError, requestId: string): NextResponse {
  return json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      requestId,
    },
    { status: error.status, headers: { ...error.headers, "X-Request-Id": requestId } },
  );
}

/**
 * Wraps a route handler with: correlation id, uniform JSON errors, request timing logs (path with
 * ids stripped, never bodies or headers), and DB readiness. Stack traces never reach clients.
 */
export function route<P = Record<string, never>>(
  handler: (ctx: RouteContext<P>) => Promise<Response>,
) {
  return async (req: Request, segment: { params: Promise<P> }): Promise<Response> => {
    const started = performance.now();
    const requestId = randomUUID();
    let status = 500;
    try {
      await getDb();
      const res = await handler({ req, params: await segment.params, requestId });
      res.headers.set("X-Request-Id", requestId);
      status = res.status;
      return res;
    } catch (error) {
      if (error instanceof AppError) {
        status = error.status;
        return errorResponse(error, requestId);
      }
      logger.error(
        { requestId, err: errorInfo(error), path: safeUrlPath(req.url) },
        "unhandled route error",
      );
      return errorResponse(
        new AppError("internal_error", "Something went wrong on our side. Please try again."),
        requestId,
      );
    } finally {
      logger.info(
        {
          requestId,
          method: req.method,
          path: safeUrlPath(req.url),
          status,
          ms: Math.round(performance.now() - started),
        },
        "request",
      );
    }
  };
}

/** Reads a JSON body with a hard byte limit, independent of Content-Length honesty. */
export async function readJson(req: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new AppError("payload_too_large", "Request body is too large.");
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json"))
    throw new AppError("bad_request", "Content-Type must be application/json.");
  if (!req.body) throw new AppError("bad_request", "Request body is required.");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError("payload_too_large", "Request body is too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("bad_request", "Request body is not valid JSON.");
  }
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests: the browser must assert the
 * request came from our own origin. API-key requests carry no ambient credentials and are exempt.
 */
export function assertSameOrigin(req: Request): void {
  if (req.method === "GET" || req.method === "HEAD" || req.headers.has("authorization")) return;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none")
    throw new AppError("forbidden", "Cross-site request rejected.");
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(env().APP_URL).origin)
    throw new AppError("forbidden", "Cross-origin request rejected.");
  if (!site && !origin && req.headers.get("cookie"))
    throw new AppError("forbidden", "Missing Origin header.");
}
