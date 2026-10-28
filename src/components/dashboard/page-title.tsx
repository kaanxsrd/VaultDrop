export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-border flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
      <span className="bg-muted text-muted-foreground grid size-11 place-items-center rounded-full">
        <Icon className="size-5" />
      </span>
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function PlanGate({ feature, plan }: { feature: string; plan: string }) {
  return (
    <div className="border-border bg-subtle rounded-xl border p-6">
      <h2 className="font-medium">
        {feature} is available on {plan}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Upgrade from Usage & billing to unlock it. Anonymous sharing stays free on every plan.
      </p>
      <a
        href="/dashboard/billing"
        className="text-primary mt-3 inline-block text-sm font-medium underline underline-offset-4"
      >
        View plans
      </a>
    </div>
  );
}
