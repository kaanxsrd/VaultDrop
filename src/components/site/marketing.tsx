import { Check } from "lucide-react";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { PLANS, type Plan, PUBLIC_PLANS } from "@/config/plans";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow && <p className="text-primary mb-2 text-sm font-medium">{eyebrow}</p>}
      <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
      {description && (
        <p className="text-muted-foreground mt-3 text-base text-pretty">{description}</p>
      )}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="border-border bg-subtle relative overflow-hidden border-b">
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -top-48 right-[-10%] size-[34rem]"
      />
      <div className="container-page relative py-14 sm:py-20">
        {eyebrow && <p className="text-primary animate-hero mb-3 text-sm font-medium">{eyebrow}</p>}
        <h1 className="animate-hero max-w-3xl text-3xl font-semibold tracking-tight text-balance [animation-delay:80ms] sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground animate-hero mt-4 max-w-2xl text-lg text-pretty [animation-delay:160ms]">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function price(plan: Plan) {
  if (plan.priceMonthly === null) return { amount: "Custom", suffix: "" };
  if (plan.priceMonthly === 0) return { amount: "$0", suffix: "forever" };
  return {
    amount: `$${plan.priceMonthly}`,
    suffix: plan.perSeat ? "per seat / month" : "per month",
  };
}

export function PricingCards({ compact = false }: { compact?: boolean }) {
  const plans = PUBLIC_PLANS.filter((id) => !compact || id !== "enterprise").map((id) => PLANS[id]);
  return (
    <Stagger
      className={cn(
        "grid gap-4",
        compact ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-5",
      )}
    >
      {plans.map((plan) => {
        const p = price(plan);
        const featured = plan.id === "pro";
        return (
          <StaggerItem
            key={plan.id}
            lift
            className={cn(
              "bg-card shadow-soft hover:shadow-lifted flex flex-col rounded-xl border p-5 transition-shadow",
              featured ? "border-primary/50 ring-primary/30 ring-1" : "border-border",
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{plan.name}</h3>
              {featured && <Badge>Popular with developers</Badge>}
            </div>
            <p className="text-muted-foreground mt-1 min-h-10 text-sm">{plan.tagline}</p>
            <p className="mt-4">
              <span className="text-3xl font-semibold tracking-tight">{p.amount}</span>
              {p.suffix && <span className="text-muted-foreground ml-1.5 text-sm">{p.suffix}</span>}
            </p>
            <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm">
              {plan.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
            <Button asChild variant={featured ? "default" : "outline"} className="mt-6">
              <Link
                href={
                  plan.id === "enterprise"
                    ? "/contact"
                    : plan.id === "free"
                      ? "/sign-up"
                      : `/sign-up?plan=${plan.id}`
                }
              >
                {plan.id === "enterprise"
                  ? "Contact us"
                  : plan.id === "free"
                    ? "Create free account"
                    : `Choose ${plan.name}`}
              </Link>
            </Button>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
