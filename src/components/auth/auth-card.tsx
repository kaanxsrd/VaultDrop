import { Card } from "@/components/ui/primitives";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Card className="shadow-lifted p-6 sm:p-7">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-muted-foreground mt-1.5 text-sm">{description}</p>}
        </div>
        {children}
      </Card>
      {footer && <div className="text-muted-foreground text-center text-sm">{footer}</div>}
    </div>
  );
}

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
  aside,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-destructive text-[13px] font-medium"
        >
          {error}
        </p>
      ) : (
        hint && <p className="text-muted-foreground text-[13px]">{hint}</p>
      )}
    </div>
  );
}
