/** Browser-side helper for VaultDrop's JSON API with typed error results. */

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiErrorBody; network?: boolean };

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<ApiResult<T>> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        Accept: "application/json",
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      network: true,
      error: {
        code: "network_error",
        message: "Couldn't reach VaultDrop. Check your connection and try again.",
      },
    };
  }
  if (res.status === 204) return { ok: true, status: 204, data: undefined as T };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  const error = (body as { error?: ApiErrorBody } | null)?.error ?? {
    code: "http_error",
    message: `Request failed (${res.status}).`,
  };
  return { ok: false, status: res.status, error };
}
