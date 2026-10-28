import { cva, type VariantProps } from "class-variance-authority";
import { Label as LabelPrimitive, Separator as SeparatorPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "border-input bg-card text-foreground placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-destructive/20 flex h-10 w-full min-w-0 rounded-lg border px-3 text-sm shadow-xs transition-[border-color,box-shadow] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "border-input bg-card text-foreground placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-ring/25 aria-invalid:border-destructive flex w-full rounded-lg border px-3 py-2.5 text-sm shadow-xs transition-[border-color,box-shadow] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-foreground text-sm leading-none font-medium select-none", className)}
      {...props}
    />
  );
}

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      className={cn(
        "bg-border shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-border bg-card text-card-foreground shadow-soft rounded-xl border",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-5 sm:p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-base font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />;
}

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary-soft text-primary-soft-foreground border-transparent",
        neutral: "border-border bg-muted text-muted-foreground",
        outline: "border-border text-foreground",
        warning: "bg-warning-soft text-warning-soft-foreground border-transparent",
        destructive: "bg-destructive-soft text-destructive border-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div aria-hidden className={cn("bg-muted animate-pulse rounded-md", className)} {...props} />
  );
}

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "border-border bg-muted text-muted-foreground inline-flex h-5 items-center rounded border px-1.5 font-mono text-[11px]",
        className,
      )}
      {...props}
    />
  );
}

const alertVariants = cva(
  "flex gap-3 rounded-lg border p-3.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        info: "border-border bg-subtle text-foreground [&>svg]:text-muted-foreground",
        success: "bg-primary-soft text-primary-soft-foreground border-transparent",
        warning: "bg-warning-soft text-warning-soft-foreground border-transparent",
        destructive: "bg-destructive-soft text-destructive border-transparent",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

export function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-muted-foreground text-[13px] leading-snug", className)} {...props} />
  );
}

export function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      role="alert"
      className={cn("text-destructive text-[13px] font-medium", className)}
      {...props}
    />
  );
}
