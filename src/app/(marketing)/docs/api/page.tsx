import Link from "next/link";
import { PageHeader } from "@/components/site/marketing";
import { Badge } from "@/components/ui/primitives";
import { buildOpenApi } from "@/lib/openapi";
import { env } from "@/server/env";
import { ApiExplorer } from "./api-explorer";

export const metadata = {
  title: "API reference",
  description: "VaultDrop REST API v1 reference with an interactive console.",
};

type Op = {
  summary: string;
  description?: string;
  operationId: string;
  tags: readonly string[];
  parameters?: readonly { name: string; in: string; required?: boolean; description?: string }[];
  responses: Record<string, { description: string }>;
  security?: readonly Record<string, readonly string[]>[];
};

const METHOD_STYLE: Record<string, string> = {
  get: "bg-primary-soft text-primary-soft-foreground",
  post: "bg-warning-soft text-warning-soft-foreground",
  delete: "bg-destructive-soft text-destructive",
};

export default function ApiReferencePage() {
  const doc = buildOpenApi(env().APP_URL);
  const ops = Object.entries(doc.paths).flatMap(([path, methods]) =>
    Object.entries(methods as Record<string, Op>).map(([method, op]) => ({ path, method, op })),
  );
  return (
    <>
      <PageHeader
        eyebrow="API reference · v1"
        title="REST API"
        description="Base URL /api/v1. JSON in, JSON out. Machine-readable spec at /api/v1/openapi.json."
      />
      <div className="container-page grid gap-10 py-12 lg:grid-cols-[1fr_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {ops.map(({ path, method, op }) => (
            <section
              key={op.operationId}
              id={op.operationId}
              className="border-border bg-card scroll-mt-24 rounded-xl border p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold uppercase ${METHOD_STYLE[method] ?? ""}`}
                >
                  {method}
                </span>
                <code className="font-mono text-sm">{path}</code>
                {op.security?.some((s) => Object.keys(s).length === 0) && (
                  <Badge variant="neutral">anonymous OK</Badge>
                )}
              </div>
              <h2 className="mt-3 font-semibold">{op.summary}</h2>
              {op.description && (
                <p className="text-muted-foreground mt-1 text-sm">{op.description}</p>
              )}
              {op.parameters && op.parameters.length > 0 && (
                <dl className="mt-3 grid gap-1 text-sm">
                  {op.parameters.map((p) => (
                    <div key={p.name} className="flex flex-wrap gap-2">
                      <dt className="font-mono text-xs">
                        {p.name}
                        <span className="text-muted-foreground">
                          {" "}
                          ({p.in}
                          {p.required ? ", required" : ""})
                        </span>
                      </dt>
                      {p.description && (
                        <dd className="text-muted-foreground text-xs">{p.description}</dd>
                      )}
                    </div>
                  ))}
                </dl>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(op.responses).map(([code, r]) => (
                  <span
                    key={code}
                    title={r.description}
                    className="border-border text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[11px]"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </section>
          ))}
          <p className="text-muted-foreground text-sm">
            Schemas, examples and the envelope format are described in the{" "}
            <Link href="/docs" className="underline underline-offset-2">
              developer guide
            </Link>
            .
          </p>
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <ApiExplorer />
        </aside>
      </div>
    </>
  );
}
