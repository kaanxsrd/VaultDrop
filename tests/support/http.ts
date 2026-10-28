type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;

let ipCounter = 0;

/** Invokes a Next.js route handler directly with a real Request object. */
export async function call<P = Record<string, never>>(
  handler: Handler<P>,
  opts: {
    method?: string;
    path?: string;
    body?: unknown;
    headers?: Record<string, string>;
    params?: P;
    ip?: string;
  } = {},
) {
  const headers: Record<string, string> = {
    "x-forwarded-for": opts.ip ?? `192.0.2.${(ipCounter++ % 250) + 1}`,
    ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    ...opts.headers,
  };
  const req = new Request(`http://localhost:3000${opts.path ?? "/"}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body:
      opts.body !== undefined
        ? typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body)
        : undefined,
  });
  const res = await handler(req, { params: Promise.resolve((opts.params ?? {}) as P) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  // biome-ignore lint/suspicious/noExplicitAny: test helper returns arbitrary JSON for assertions
  return { status: res.status, headers: res.headers, json: json as any };
}
