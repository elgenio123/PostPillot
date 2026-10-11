import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsd(v: number) {
  return v === 0 ? "$0.00" : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

export function formatFcfa(usd: number, rate: number) {
  const v = usd * rate;
  return `${v < 10 && v > 0 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")} FCFA`;
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "content-type": "application/json", ...init?.headers } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const body = await res.json().catch(() => ({}));
  // Session expired or signed out elsewhere: back to the login page
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/") && window.location.pathname !== "/login") {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Request failed (${res.status})`), { status: res.status, body });
  return body as T;
}
