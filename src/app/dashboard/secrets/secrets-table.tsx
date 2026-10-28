"use client";

import { ChevronLeft, ChevronRight, Flame, LockKeyhole, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/dashboard/page-title";
import { type Receipt, StateBadge } from "@/components/reveal/receipt-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Select,
} from "@/components/ui/overlays";
import { Alert, Input, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";

const STATES = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "consumed", label: "Opened" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Destroyed" },
];
const SORTS = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "expires_asc", label: "Expiring soonest" },
  { value: "expires_desc", label: "Expiring latest" },
];

interface ListResponse {
  items: Receipt[];
  total: number;
  page: number;
  pageSize: number;
}

export function SecretsTable() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const state = params.get("state") ?? "all";
  const sort = params.get("sort") ?? "created_desc";
  const page = Number(params.get("page") ?? "1");
  const q = params.get("q") ?? "";
  const [query, setQuery] = useState(q);
  const [result, setResult] = useState<{
    key: string;
    data: ListResponse | null;
    error: string | null;
  } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [burnTarget, setBurnTarget] = useState<Receipt | null>(null);
  const requestKey = `${new URLSearchParams({ state, sort, page: String(page), pageSize: "20", ...(q ? { q } : {}) })}#${reloadNonce}`;
  const loading = result?.key !== requestKey;
  const data = result?.data ?? null;
  const error = result?.key === requestKey ? result.error : null;
  const load = () => setReloadNonce((n) => n + 1);

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(updates)) {
        if (
          v === null ||
          v === "" ||
          (k === "state" && v === "all") ||
          (k === "sort" && v === "created_desc") ||
          (k === "page" && v === "1")
        )
          next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    let cancelled = false;
    const qs = requestKey.split("#")[0];
    void apiFetch<ListResponse>(`/api/v1/secrets?${qs}`).then((res) => {
      if (cancelled) return;
      setResult((prev) =>
        res.ok
          ? { key: requestKey, data: res.data, error: null }
          : { key: requestKey, data: prev?.data ?? null, error: res.error.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  // Debounced label search.
  useEffect(() => {
    if (query === q) return;
    const t = setTimeout(() => setParam({ q: query, page: "1" }), 300);
    return () => clearTimeout(t);
  }, [query, q, setParam]);

  async function burn(item: Receipt) {
    const res = await apiFetch<{ state: string }>(`/api/v1/secrets/${item.id}/burn`, {
      method: "POST",
    });
    if (res.ok) {
      toast("Secret destroyed. The link no longer works.", "success");
      load();
    } else toast(res.error.message, "error");
    setBurnTarget(null);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          role="tablist"
          aria-label="Filter by state"
          className="bg-muted flex gap-1 overflow-x-auto rounded-lg p-1"
        >
          {STATES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="tab"
              aria-selected={state === s.value}
              onClick={() => setParam({ state: s.value, page: "1" })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                state === s.value
                  ? "bg-card text-foreground font-medium shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search labels"
              aria-label="Search by label"
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Sort"
            value={sort}
            onValueChange={(v) => setParam({ sort: v, page: "1" })}
            options={SORTS}
            className="w-44"
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw /> Retry
          </Button>
        </Alert>
      )}

      {loading && !data ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading secrets">
          {Array.from({ length: 5 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders that never reorder
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={LockKeyhole}
          title={q || state !== "all" ? "No matching secrets" : "No secrets yet"}
          description={
            q || state !== "all"
              ? "Try a different filter or search."
              : "Secrets you create while signed in will appear here as metadata."
          }
          action={
            !(q || state !== "all") && (
              <Button asChild size="sm">
                <Link href="/#share">New secret</Link>
              </Button>
            )
          }
        />
      ) : (
        data && (
          <div
            className={cn(
              "border-border bg-card overflow-hidden rounded-xl border transition-opacity",
              loading && "opacity-60",
            )}
          >
            <table className="w-full text-sm">
              <caption className="sr-only">Your secrets</caption>
              <thead className="border-border bg-subtle text-muted-foreground hidden border-b text-left text-xs md:table-header-group">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Secret
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Views
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Expires
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {data.items.map((s) => (
                  <tr
                    key={s.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 md:table-row md:p-0"
                  >
                    <td className="w-full md:w-auto md:px-4 md:py-3">
                      <div className="font-medium">
                        {s.label ?? (
                          <span className="text-muted-foreground font-mono">
                            {s.id.slice(0, 10)}…
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Created {formatDateTime(s.createdAt)}
                        {s.hasPassphrase && " · passphrase"}
                      </div>
                    </td>
                    <td className="md:px-4 md:py-3">
                      <StateBadge state={s.state} />
                    </td>
                    <td className="text-muted-foreground tabular-nums md:px-4 md:py-3">
                      {s.viewCount}/{s.maxViews}
                    </td>
                    <td className="text-muted-foreground md:px-4 md:py-3">
                      {s.state === "active" ? formatRelative(s.expiresAt) : "—"}
                    </td>
                    <td className="ml-auto md:px-4 md:py-3 md:text-right">
                      {s.state === "active" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setBurnTarget(s)}
                          aria-label={`Destroy ${s.label ?? "secret"}`}
                        >
                          <Flame /> Destroy
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {data && data.total > data.pageSize && (
        <nav
          aria-label="Pagination"
          className="text-muted-foreground flex items-center justify-between text-sm"
        >
          <span>
            Page {page} of {totalPages} · {data.total} secrets
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParam({ page: String(page - 1) })}
            >
              <ChevronLeft /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setParam({ page: String(page + 1) })}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </nav>
      )}

      <Dialog open={burnTarget !== null} onOpenChange={(o) => !o && setBurnTarget(null)}>
        <DialogContent>
          <DialogTitle>Destroy this secret?</DialogTitle>
          <DialogDescription>
            The encrypted content is deleted immediately and the link stops working for the
            recipient. This cannot be undone.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => burnTarget && void burn(burnTarget)}>
              Destroy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
