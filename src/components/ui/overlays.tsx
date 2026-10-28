"use client";

import { Check, ChevronDown, X } from "lucide-react";
import {
  Dialog as DialogPrimitive,
  DropdownMenu as Menu,
  Select as SelectPrimitive,
  Switch as SwitchPrimitive,
  Tooltip as TooltipPrimitive,
} from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------- Dialog --------------------------------- */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="data-[state=open]:animate-fade-in fixed inset-0 z-50 bg-black/40" />
      <DialogPrimitive.Content
        className={cn(
          "border-border bg-popover text-popover-foreground shadow-lifted data-[state=open]:animate-rise fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border p-6 outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-3.5 right-3.5 rounded-md p-1 transition-colors">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("pr-6 text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

/* --------------------------------- Tooltip --------------------------------- */

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="bg-foreground text-background shadow-lifted data-[state=delayed-open]:animate-fade-in z-50 max-w-xs rounded-md px-2.5 py-1.5 text-xs"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

/* ---------------------------------- Switch --------------------------------- */

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer bg-input focus-visible:outline-ring data-[state=checked]:bg-primary inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

/* ---------------------------------- Select --------------------------------- */

export function Select({
  value,
  onValueChange,
  options,
  id,
  className,
  "aria-label": ariaLabel,
  disabled,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean; hint?: string }[];
  id?: string;
  className?: string;
  "aria-label"?: string;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/25 flex h-10 w-full items-center justify-between gap-2 rounded-lg border px-3 text-sm shadow-xs outline-none focus-visible:ring-3 disabled:opacity-60",
          className,
        )}
      >
        {/* Explicit text so the server render shows the value before hydration (no blank flash). */}
        <SelectPrimitive.Value>
          {options.find((o) => o.value === value)?.label}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon>
          <ChevronDown className="text-muted-foreground size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="border-border bg-popover text-popover-foreground shadow-lifted data-[state=open]:animate-fade-in z-50 max-h-[min(var(--radix-select-content-available-height),20rem)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border p-1"
        >
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="data-[highlighted]:bg-muted relative flex cursor-default items-center justify-between gap-3 rounded-md py-2 pr-8 pl-2.5 text-sm outline-none select-none data-[disabled]:opacity-45"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                {o.hint && <span className="text-muted-foreground text-xs">{o.hint}</span>}
                <SelectPrimitive.ItemIndicator className="absolute right-2">
                  <Check className="text-primary size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* ------------------------------- DropdownMenu ------------------------------ */

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({
  className,
  align = "end",
  ...props
}: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className={cn(
          "border-border bg-popover text-popover-foreground shadow-lifted data-[state=open]:animate-fade-in z-50 min-w-48 rounded-lg border p-1",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        "data-[highlighted]:bg-muted [&_svg]:text-muted-foreground flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[disabled]:opacity-50 [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn("text-muted-foreground px-2.5 py-1.5 text-xs", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="bg-border my-1 h-px" />;
}
