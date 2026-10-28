import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 3600)
    return `${Math.round(seconds / 60)} minute${Math.round(seconds / 60) === 1 ? "" : "s"}`;
  if (seconds < 86400)
    return `${Math.round(seconds / 3600)} hour${Math.round(seconds / 3600) === 1 ? "" : "s"}`;
  return `${Math.round(seconds / 86400)} day${Math.round(seconds / 86400) === 1 ? "" : "s"}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelative(date: Date | string, now = Date.now()): string {
  const diff = (new Date(date).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(date),
  );
}
