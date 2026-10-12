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

export function Header() {
  const { config, settings, updateSettings, costs, connected, theme, toggleTheme } = useApp();
  const pathname = usePathname();
  const rate = config?.fcfaPerUsd ?? 600;
  const onRun = pathname.startsWith("/runs/");
  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2.5 xl:flex-nowrap">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Logo className="size-9 rounded-xl [&_svg]:size-5" />
          <span className="flex flex-col leading-none">
            <span className="text-lg font-extrabold tracking-tight">PostPilot</span>
            <span className="text-xs font-medium text-muted-foreground">AI drafts. You decide.</span>
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-0.5 rounded-xl bg-muted p-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" || onRun : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={cn("relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-card shadow-soft" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />}
                <Icon className="relative size-4" aria-hidden />
                <span className="relative">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-1.5 xl:flex-nowrap">
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
              <Toggle icon={Send} label="Publishing" on="Mock" off="Real" checked={settings.mock} onChange={(mock) => updateSettings({ mock })}
                tip="Mock simulates Facebook and LinkedIn: fake post links and growing fake engagement. Real posts to your accounts." />
              <Toggle icon={Smartphone} label="Telegram" on="On" off="Off" checked={settings.telegram} onChange={(telegram) => updateSettings({ telegram })}
                tip="Also send each draft to your phone with Approve / Reject buttons" />
              <Toggle icon={Target} label="Demo trap" on="On" off="Off" checked={settings.trap} onChange={(trap) => updateSettings({ trap })}
                tip="The agent hides one plausible mistake in one draft. Can you catch it before approving?" />
            </>
          ) : (
            <div className="shimmer h-9 w-[560px] rounded-xl" />
          )}

          <Tip content={`This run: ${formatUsd(costs.runUsd)} · Today: ${formatUsd(costs.todayUsd)} · All time: ${formatUsd(costs.totalUsd)}`}>
            <div className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-br from-[#3730A3] to-[#4F46E5] px-3 py-1 text-white shadow-soft">
              <Coins className="size-4 text-orange-300" aria-hidden />
              <span className="flex flex-col leading-tight">
                <span className="text-[0.65rem] font-medium uppercase tracking-wide text-indigo-200">{onRun ? "This run" : "Today"}</span>
                <span className="text-sm font-bold tabular-nums">
                  {formatFcfa(onRun ? costs.runUsd : costs.todayUsd, rate)}
                  <span className="ml-1.5 text-xs font-medium text-indigo-200">{formatUsd(onRun ? costs.runUsd : costs.todayUsd)}</span>
                </span>
              </span>
            </div>
          </Tip>

          <Tip content={connected ? "Live updates connected" : "Reconnecting to live updates…"}>
            <span className={cn("size-2.5 shrink-0 rounded-full", connected ? "bg-success shadow-[0_0_0_4px_var(--success-soft)]" : "animate-pulse bg-warning")} />
          </Tip>
          <button onClick={toggleTheme} className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Toggle dark mode">
            {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </button>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
