"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Bot, Briefcase, CheckCircle2, CircleDashed, ExternalLink, KeyRound, Users, Loader2, RefreshCw, Smartphone, Workflow, XCircle } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, cn } from "@/lib/utils";
import { spring } from "@/lib/motion";

const SERVICES = [
  { id: "n8n", name: "n8n", icon: Workflow, why: "Runs every agent workflow. Required." },
  { id: "openrouter", name: "OpenRouter", icon: KeyRound, why: "AI text, images and videos. Required." },
  { id: "telegram", name: "Telegram", icon: Smartphone, why: "Approve drafts from your phone. Optional." },
  { id: "facebook", name: "Facebook Page", icon: Users, why: "Real publishing. Not needed in Mock mode." },
  { id: "linkedin", name: "LinkedIn", icon: Briefcase, why: "Real publishing. Not needed in Mock mode." },
];

type Result = { ok: boolean; message: string; configured?: boolean } | "loading" | null;

export default function SettingsPage() {
  const { config, settings } = useApp();
  const [results, setResults] = React.useState<Record<string, Result>>({});

  const test = React.useCallback(async (id: string, send = true) => {
    setResults((r) => ({ ...r, [id]: "loading" }));
    const res = await api<{ ok: boolean; message: string }>(`/api/health/${id}${send ? "?send=1" : ""}`).catch((e) => ({ ok: false, message: (e as Error).message }));
    setResults((r) => ({ ...r, [id]: res }));
  }, []);

  const testAll = React.useCallback((send = true) => SERVICES.forEach((s) => test(s.id, send)), [test]);
  // Quiet check on page load: no Telegram test message
  React.useEffect(() => testAll(false), [testAll]);

  const okCount = SERVICES.filter((s) => { const r = results[s.id]; return r && r !== "loading" && r.ok; }).length;

  return (
    <div className="grid gap-6 sm:gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Settings & connections</h1>
          {/* <p className="mt-1 text-lg text-muted-foreground">Check everything before the audience arrives. Keys live in the <code className="rounded bg-muted px-1.5">.env</code> file.</p> */}
        </div>
        <Button variant="primary" size="lg" onClick={() => testAll()}><RefreshCw /> Test all</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Connections</CardTitle>
            <CardDescription>{okCount} of {SERVICES.length} connected</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {SERVICES.map((s, i) => {
              const r = results[s.id];
              const state = r === "loading" || r === undefined ? "loading" : r === null ? "idle" : r.ok ? "ok" : r.configured === false ? "unset" : "bad";
              return (
                <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={cn("flex flex-wrap items-center gap-3 rounded-2xl border-2 p-3 transition-colors duration-500 sm:gap-4 sm:p-4", state === "ok" ? "border-success/30 bg-success-soft/50" : state === "bad" ? "border-danger/25 bg-danger-soft/50" : "border-border")}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-card shadow-soft sm:size-12"><s.icon className="size-6 text-primary" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold">{s.name}</p>
                    <p className="text-muted-foreground">{state === "ok" || state === "bad" || state === "unset" ? (r as { message: string }).message : s.why}</p>
                  </div>
                  <motion.span key={state} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={spring} className="flex items-center gap-2 font-semibold">
                    {state === "loading" && <><Loader2 className="size-6 animate-spin text-muted-foreground" /> Testing</>}
                    {state === "ok" && <><CheckCircle2 className="size-6 text-success" /> Connected</>}
                    {state === "bad" && <><XCircle className="size-6 text-danger" /> Not connected</>}
                    {state === "idle" && <><CircleDashed className="size-6 text-muted-foreground" /> Not tested</>}
                    {state === "unset" && <><CircleDashed className="size-6 text-muted-foreground" /> Not set up</>}
                  </motion.span>
                  <Button variant="secondary" loading={state === "loading"} onClick={() => test(s.id)}>Test</Button>
                </motion.div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle>Current modes</CardTitle><CardDescription>Change them in the header at any time.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 text-base sm:text-lg">
              <p className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><Bot className="size-5 text-primary" /> Model</span><Badge tone="primary">{config?.models.find((m) => m.id === settings?.model)?.label ?? settings?.model}</Badge></p>
              <p className="flex items-center justify-between gap-3"><span>Image model</span><Badge className="min-w-0 truncate">{config?.imageModel || "not set"}</Badge></p>
              <p className="flex items-center justify-between gap-3"><span>Video model</span><Badge className="min-w-0 truncate">{config?.videoModel || "not set"}</Badge></p>
              <p className="flex items-center justify-between gap-3"><span>Publishing</span><Badge tone={settings?.mock ? "neutral" : "primary"}>{settings?.mock ? "Mock" : "Real"}</Badge></p>
              <p className="flex items-center justify-between gap-3"><span>Telegram approval</span><Badge tone={settings?.telegram ? "success" : "neutral"}>{settings?.telegram ? "On" : "Off"}</Badge></p>
              <p className="flex items-center justify-between gap-3"><span>Demo trap</span><Badge tone={settings?.trap ? "danger" : "neutral"}>{settings?.trap ? "On" : "Off"}</Badge></p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>n8n workflows</CardTitle><CardDescription>Open them to show the audience how the agent works.</CardDescription></CardHeader>
            <CardContent className="grid gap-2">
              {config && Object.entries({ generate: "Generate drafts", redraft: "Redraft", approval: "Telegram approval", publish: "Publish", report: "Weekly report" }).map(([key, label]) => (
                <a key={key} href={`${config.n8nUrl}/workflow/${config.workflows[key]}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl px-3 py-2.5 font-semibold hover:bg-muted">
                  <span className="flex items-center gap-2"><Workflow className="size-5 text-primary" /> PostPilot – {label}</span>
                  <ExternalLink className="size-4 opacity-60" />
                </a>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
