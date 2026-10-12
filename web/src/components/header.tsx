"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Bot, Coins, Smartphone, LayoutDashboard, Moon, PenLine, Send, Settings2, SlidersHorizontal, Sun, Target } from "lucide-react";
import { Logo } from "@/components/logo";
import { AccountMenu } from "@/components/account-menu";
import { CountUp } from "@/components/count-up";
import { useApp } from "@/components/app-provider";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, Switch, Tip } from "@/components/ui/controls";
import { cn, formatFcfa, formatUsd } from "@/lib/utils";
import type { Settings } from "@/lib/types";

const NAV = [
  { href: "/", label: "Brief", icon: PenLine },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

// The three header switches; `tip` is a tooltip on desktop and a visible line in the mobile panel
const TOGGLES: { key: "mock" | "telegram" | "trap"; icon: typeof Bot; label: string; on: string; off: string; tip: string }[] = [
  { key: "mock", icon: Send, label: "Publishing", on: "Mock", off: "Real", tip: "Mock simulates Facebook and LinkedIn: fake post links and growing fake engagement. Real posts to your accounts." },
  { key: "telegram", icon: Smartphone, label: "Telegram", on: "On", off: "Off", tip: "Also send each draft to your phone with Approve / Reject buttons" },
  { key: "trap", icon: Target, label: "Demo trap", on: "On", off: "Off", tip: "The agent hides one plausible mistake in one draft. Can you catch it before approving?" },
];

function Toggle({ icon: Icon, label, checked, onChange, tip, on, off }: {
  icon: typeof Bot; label: string; checked: boolean; onChange: (v: boolean) => void; tip: string; on: string; off: string;
}) {
  return (
    <Tip content={tip}>
      <label className={cn("flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-1 transition-colors", checked ? "border-primary/30 bg-primary-soft" : "border-border bg-card")}>
        <Icon className={cn("size-4", checked ? "text-primary" : "text-muted-foreground")} aria-hidden />
        <span className="flex flex-col leading-tight">
          <span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="text-xs font-bold">{checked ? on : off}</span>
        </span>
        <Switch size="sm" checked={checked} onCheckedChange={onChange} aria-label={label} />
      </label>
    </Tip>
  );
}

function useActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/runs/") : pathname.startsWith(href));
}

// Phones and small tablets: model, switches and theme live in a side panel
function ControlsPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { config, settings, updateSettings, theme, toggleTheme } = useApp();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="right" className="max-w-sm">
        <DialogTitle>Agent controls</DialogTitle>
        <DialogDescription>Apply to the next run.</DialogDescription>
        {settings && config && (
          <div className="mt-6 grid gap-4">
            <div>
              <p className="mb-2 flex items-center gap-2 font-semibold"><Bot className="size-4 text-primary" /> AI model</p>
              <Select
                className="h-11 w-full text-base"
                value={settings.model}
                onValueChange={(model) => updateSettings({ model })}
                options={config.models.map((m) => ({ value: m.id, label: m.label, hint: m.note }))}
              />
            </div>
            {TOGGLES.map((t) => {
              const checked = settings[t.key];
              return (
                <label key={t.key} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors", checked ? "border-primary/30 bg-primary-soft" : "border-border")}>
                  <t.icon className={cn("mt-0.5 size-5 shrink-0", checked ? "text-primary" : "text-muted-foreground")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-bold">{t.label} <span className="text-sm font-semibold text-muted-foreground">{checked ? t.on : t.off}</span></span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{t.tip}</span>
                  </span>
                  <Switch checked={checked} onCheckedChange={(v) => updateSettings({ [t.key]: v } as Partial<Settings>)} aria-label={t.label} />
                </label>
              );
            })}
            <button onClick={toggleTheme} className="flex items-center gap-3 rounded-2xl border border-border p-3.5 text-left font-bold hover:bg-muted">
              {theme === "light" ? <Moon className="size-5 text-muted-foreground" /> : <Sun className="size-5 text-muted-foreground" />}
              {theme === "light" ? "Dark mode" : "Light mode"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Phones: app-style tab bar at the bottom of the screen
function BottomNav() {
  const active = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Main">
      <div className="grid grid-cols-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const on = active(href);
          return (
            <Link key={href} href={href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-xs font-semibold", on ? "text-primary" : "text-muted-foreground")}>
              {on && <motion.span layoutId="tab-dot" className="absolute inset-x-8 top-0 h-0.5 rounded-full bg-primary" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
              <motion.span animate={{ y: on ? -1 : 0, scale: on ? 1.12 : 1 }} transition={{ type: "spring", bounce: 0.5, duration: 0.4 }}>
                <Icon className="size-5" aria-hidden />
              </motion.span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Header() {
  const { config, settings, updateSettings, costs, connected, theme, toggleTheme } = useApp();
  const pathname = usePathname();
  const active = useActive();
  const [panel, setPanel] = React.useState(false);
  const rate = config?.fcfaPerUsd ?? 600;
  const onRun = pathname.startsWith("/runs/");
  if (pathname === "/login") return null;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] items-center gap-x-3 px-4 py-2 sm:px-6 sm:py-2.5 xl:gap-x-4">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <Logo className="size-9 rounded-xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105 [&_svg]:size-5" />
            <span className="flex flex-col leading-none">
              <span className="text-lg font-extrabold tracking-tight">PostPilot</span>
              <span className="hidden text-xs font-medium text-muted-foreground sm:block">AI drafts. You decide.</span>
            </span>
          </Link>

          <nav className="hidden shrink-0 items-center gap-0.5 rounded-xl bg-muted p-1 md:flex">
            {NAV.map(({ href, label, icon: Icon }) => {
              const on = active(href);
              return (
                <Link key={href} href={href} className={cn("relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {on && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-card shadow-soft" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                  <Icon className="relative size-4" aria-hidden />
                  <span className="relative">{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            {/* Wide screens: every control in the bar */}
            <div className="hidden items-center gap-1.5 xl:flex">
              {settings && config ? (
                <>
                  <Tip content="The AI model on OpenRouter that writes the posts">
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Bot className="size-4 text-primary" aria-hidden />
                      <Select
                        className="h-9 w-44 rounded-xl px-3 text-sm"
                        value={settings.model}
                        onValueChange={(model) => updateSettings({ model })}
                        options={config.models.map((m) => ({ value: m.id, label: m.label, hint: m.note }))}
                      />
                    </div>
                  </Tip>
                  {TOGGLES.map((t) => (
                    <Toggle key={t.key} icon={t.icon} label={t.label} on={t.on} off={t.off} tip={t.tip}
                      checked={settings[t.key]} onChange={(v) => updateSettings({ [t.key]: v } as Partial<Settings>)} />
                  ))}
                </>
              ) : (
                <div className="shimmer h-9 w-[560px] rounded-xl" />
              )}
            </div>

            <Tip content={`This run: ${formatUsd(costs.runUsd)} · Today: ${formatUsd(costs.todayUsd)} · All time: ${formatUsd(costs.totalUsd)}`}>
              <div className="flex min-w-0 shrink items-center gap-2 rounded-xl bg-brand px-2.5 py-1 text-white shadow-soft sm:px-3">
                <Coins className="size-4 shrink-0 text-indigo-200" aria-hidden />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-[0.65rem] font-medium uppercase tracking-wide text-indigo-200">{onRun ? "This run" : "Today"}</span>
                  <span className="truncate text-sm font-bold tabular-nums">
                    <CountUp value={onRun ? costs.runUsd : costs.todayUsd} format={(n) => formatFcfa(n, rate)} duration={0.6} />
                    <span className="ml-1.5 hidden text-xs font-medium text-indigo-200 sm:inline">{formatUsd(onRun ? costs.runUsd : costs.todayUsd)}</span>
                  </span>
                </span>
              </div>
            </Tip>

            <Tip content={connected ? "Live updates connected" : "Reconnecting to live updates…"}>
              <span className={cn("hidden size-2.5 shrink-0 rounded-full sm:block", connected ? "bg-success shadow-[0_0_0_4px_var(--success-soft)]" : "animate-pulse bg-warning")} />
            </Tip>
            <button onClick={toggleTheme} className="hidden shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:block" aria-label="Toggle dark mode">
              {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
            <button onClick={() => setPanel(true)} className="relative shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground xl:hidden" aria-label="Agent controls">
              <SlidersHorizontal className="size-5" />
              {/* Reminds the demonstrator that real posts are switched on */}
              {settings && !settings.mock && <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" />}
            </button>
            <AccountMenu />
          </div>
        </div>
      </header>
      <ControlsPanel open={panel} onOpenChange={setPanel} />
      <BottomNav />
    </>
  );
}
