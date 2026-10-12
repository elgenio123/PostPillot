"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { MotionConfig } from "motion/react";
import { toast, Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/controls";
import { api } from "@/lib/utils";
import type { AppConfig, Settings } from "@/lib/types";

type BusEvent = { type: string; runId?: string; [k: string]: unknown };
type Listener = (e: BusEvent) => void;

export interface User { id: string; email: string; name: string; mustChangePassword: boolean }

interface Ctx {
  user: User | null;
  setUser: (u: User | null) => void;
  config: AppConfig | null;
  settings: Settings | null;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  costs: { runUsd: number; todayUsd: number; totalUsd: number };
  subscribe: (fn: Listener) => () => void;
  connected: boolean;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const AppCtx = React.createContext<Ctx | null>(null);

export function useApp() {
  const ctx = React.useContext(AppCtx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}

// Calls `fn` for every live event from the server
export function useLiveEvents(fn: Listener) {
  const { subscribe } = useApp();
  const ref = React.useRef(fn);
  ref.current = fn;
  React.useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}

const PLATFORM = { facebook: "Facebook", linkedin: "LinkedIn" } as Record<string, string>;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<AppConfig | null>(null);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [costs, setCosts] = React.useState({ runUsd: 0, todayUsd: 0, totalUsd: 0 });
  const [connected, setConnected] = React.useState(false);
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const listeners = React.useRef(new Set<Listener>());
  const [user, setUser] = React.useState<User | null>(null);
  const pathname = usePathname();
  const runId = pathname.startsWith("/runs/") ? pathname.split("/")[2] : null;
  // The login page has no session yet, so nothing else is loaded there
  const signedIn = pathname !== "/login";

  React.useEffect(() => {
    try {
      if (localStorage.getItem("pp-theme") === "dark") setTheme("dark");
    } catch {}
  }, []);

  React.useEffect(() => {
    if (!signedIn) return;
    api<{ user: User }>("/api/auth/me").then((r) => setUser(r.user)).catch(() => {});
    api<AppConfig>("/api/config").then(setConfig).catch(() => toast.error("Could not load the configuration"));
    api<Settings>("/api/settings").then(setSettings).catch(() => {});
  }, [signedIn]);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const refreshCosts = React.useCallback(() => {
    if (!signedIn) return;
    api<typeof costs>(`/api/costs${runId ? `?runId=${runId}` : ""}`).then(setCosts).catch(() => {});
  }, [runId, signedIn]);
  React.useEffect(refreshCosts, [refreshCosts]);

  // One Server-Sent Events connection for the whole app; EventSource reconnects by itself
  React.useEffect(() => {
    if (!signedIn) return;
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      const evt = JSON.parse(m.data) as BusEvent;
      listeners.current.forEach((fn) => fn(evt));
    };
    return () => es.close();
  }, [signedIn]);

  // Global toasts and cost refresh
  React.useEffect(() => {
    const fn: Listener = (e) => {
      if (e.type === "cost") refreshCosts();
      if (e.type === "decision") {
        const where = e.source === "telegram" ? "from Telegram" : "in the app";
        const what = e.decision === "approve" ? "approved" : "rejected";
        const msg = `${PLATFORM[e.platform as string]} post ${what} ${where}`;
        if (e.decision === "approve") toast.success(msg);
        else toast.warning(msg);
      }
      if (e.type === "post" && e.status === "published") toast.success(`${PLATFORM[e.platform as string]} post published`);
      if (e.type === "post" && e.status === "failed") toast.error(`${PLATFORM[e.platform as string]} post failed`);
      if (e.type === "report") toast.success("Weekly report ready");
    };
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, [refreshCosts]);

  const subscribe = React.useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  const updateSettings = React.useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    try {
      setSettings(await api<Settings>("/api/settings", { method: "PUT", json: patch }));
    } catch (err) {
      toast.error((err as Error).message);
      api<Settings>("/api/settings").then(setSettings).catch(() => {});
    }
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme((t) => {
      const next = t === "light" ? "dark" : "light";
      try { localStorage.setItem("pp-theme", next); } catch {}
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({ user, setUser, config, settings, updateSettings, costs, subscribe, connected, theme, toggleTheme }),
    [user, config, settings, updateSettings, costs, subscribe, connected, theme, toggleTheme],
  );

  return (
    <AppCtx.Provider value={value}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          {children}
          <Toaster position="bottom-right" mobileOffset={{ bottom: 76 }} richColors theme={theme} toastOptions={{ style: { fontSize: "0.95rem", padding: "12px 14px", borderRadius: 14 } }} />
        </TooltipProvider>
      </MotionConfig>
    </AppCtx.Provider>
  );
}
