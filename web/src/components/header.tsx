"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Bot, Coins, Smartphone, LayoutDashboard, Moon, PenLine, Send, Settings2, Sun, Target } from "lucide-react";
import { Logo } from "@/components/logo";
import { AccountMenu } from "@/components/account-menu";
import { useApp } from "@/components/app-provider";
import { Select, Switch, Tip } from "@/components/ui/controls";
import { cn, formatFcfa, formatUsd } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Brief", icon: PenLine },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function Toggle({ icon: Icon, label, checked, onChange, tip, on, off }: {
  icon: typeof Bot; label: string; checked: boolean; onChange: (v: boolean) => void; tip: string; on: string; off: string;
}) {
  return (
    <Tip content={tip}>
      <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-2xl border px-3 py-1.5 transition-colors", checked ? "border-primary/30 bg-primary-soft" : "border-border bg-card")}>
        <Icon className={cn("size-5", checked ? "text-primary" : "text-muted-foreground")} aria-hidden />
        <span className="flex flex-col leading-tight">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="text-sm font-bold">{checked ? on : off}</span>
        </span>
        <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
      </label>
    </Tip>
  );
}

export function Header() {
  const { config, settings, updateSettings, costs, connected, theme, toggleTheme } = useApp();
  const pathname = usePathname();
  const rate = config?.fcfaPerUsd ?? 600;
  const onRun = pathname.startsWith("/runs/");
  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <Link href="/" className="flex items-center gap-3">
          <Logo />
          <span className="flex flex-col leading-none">
            <span className="text-2xl font-extrabold tracking-tight">PostPilot</span>
            <span className="text-sm font-medium text-muted-foreground">AI drafts. You decide.</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 rounded-2xl bg-muted p-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" || onRun : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={cn("relative flex items-center gap-2 rounded-xl px-4 py-2 font-semibold transition-colors", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-card shadow-soft" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                <Icon className="relative size-5" aria-hidden />
                <span className="relative">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {settings && config ? (
            <>
              <Tip content="The AI model on OpenRouter that writes the posts">
                <div className="flex items-center gap-2">
                  <Bot className="size-5 text-primary" aria-hidden />
                  <Select
                    className="h-11 w-60"
                    value={settings.model}
                    onValueChange={(model) => updateSettings({ model })}
                    options={config.models.map((m) => ({ value: m.id, label: m.label, hint: m.note }))}
                  />
                </div>
              </Tip>
              <Toggle icon={Send} label="Publishing" on="Mock" off="Real" checked={settings.mock} onChange={(mock) => updateSettings({ mock })}
                tip="Mock simulates Facebook and LinkedIn: fake post links and growing fake engagement. Real posts to your accounts." />
              <Toggle icon={Smartphone} label="Telegram" on="On" off="Off" checked={settings.telegram} onChange={(telegram) => updateSettings({ telegram })}
                tip="Also send each draft to your phone with Approve / Reject buttons" />
              <Toggle icon={Target} label="Demo trap" on="On" off="Off" checked={settings.trap} onChange={(trap) => updateSettings({ trap })}
                tip="The agent hides one plausible mistake in one draft. Can you catch it before approving?" />
            </>
          ) : (
            <div className="shimmer h-11 w-[620px] rounded-2xl" />
          )}

          <Tip content={`This run: ${formatUsd(costs.runUsd)} · Today: ${formatUsd(costs.todayUsd)} · All time: ${formatUsd(costs.totalUsd)}`}>
            <div className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-br from-primary to-[#4F46E5] px-4 py-1.5 text-white shadow-lift dark:from-[#312E81] dark:to-[#3730A3]">
              <Coins className="size-5 text-orange-300" aria-hidden />
              <span className="flex flex-col leading-tight">
                <span className="text-xs font-medium uppercase tracking-wide text-indigo-200">{onRun ? "This run" : "Today"}</span>
                <span className="font-bold tabular-nums">
                  {formatFcfa(onRun ? costs.runUsd : costs.todayUsd, rate)}
                  <span className="ml-1.5 text-sm font-medium text-indigo-200">{formatUsd(onRun ? costs.runUsd : costs.todayUsd)}</span>
                </span>
              </span>
            </div>
          </Tip>

          <Tip content={connected ? "Live updates connected" : "Reconnecting to live updates…"}>
            <span className={cn("size-3 rounded-full", connected ? "bg-success shadow-[0_0_0_4px_var(--success-soft)]" : "animate-pulse bg-warning")} />
          </Tip>
          <button onClick={toggleTheme} className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Toggle dark mode">
            {theme === "light" ? <Moon className="size-5" /> : <Sun className="size-5" />}
          </button>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
