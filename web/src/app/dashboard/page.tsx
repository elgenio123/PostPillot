"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { BarChart3, CheckCircle2, Coins, ExternalLink, FileText, Heart, Inbox, Loader2, PenLine, Rocket, Sparkles, ThumbsUp } from "lucide-react";
import { useApp, useLiveEvents } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/fields";
import { PlatformIcon } from "@/components/platform-icons";
import { EngagementChart } from "@/components/engagement-chart";
import type { Post } from "@/lib/types";
import { api, cn, formatDateTime, formatFcfa, formatUsd, timeAgo } from "@/lib/utils";

interface Engagement { likes: number; comments: number; shares: number; reach: number; available: boolean; mock: boolean }
interface DashPost extends Post { title: string | null; organisation: string; text: string; engagement: Engagement | null }
interface Report { id: string; title: string; text: string; createdAt: string; periodStart: string; periodEnd: string }
interface Dashboard {
  stats: { published: number; scheduled: number; failed: number; approvalRate: number | null; decisions: number; engagement: number; runs: number };
  costs: { todayUsd: number; totalUsd: number };
  posts: DashPost[];
  reports: Report[];
}
interface RunRow { id: string; title: string | null; organisation: string; status: string; createdAt: string; costUsd: number; platforms: ("facebook" | "linkedin")[] }

const RUN_STATUS: Record<string, { label: string; tone: "neutral" | "primary" | "accent" | "success" | "warning" | "danger" }> = {
  generating: { label: "Drafting", tone: "accent" },
  awaiting_approval: { label: "Waiting for approval", tone: "warning" },
  approved: { label: "Approved", tone: "primary" },
  published: { label: "Published", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

function postStatus(p: DashPost) {
  if (p.engagement) return { label: "Published", tone: "success" as const };
  if (p.status === "scheduled") return { label: "Scheduled", tone: "primary" as const };
  if (p.status === "failed") return { label: "Failed", tone: "danger" as const };
  return { label: "Publishing", tone: "accent" as const };
}

function Stat({ icon: Icon, label, value, sub, accent, delay }: { icon: typeof Rocket; label: string; value: React.ReactNode; sub?: string; accent?: boolean; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className={cn("relative h-full overflow-hidden p-6", accent && "border-transparent bg-gradient-to-br from-[#3730A3] to-[#0284C7] text-white")}>
        <span className={cn("mb-4 grid size-12 place-items-center rounded-2xl", accent ? "bg-white/15" : "bg-primary-soft text-primary")}><Icon className="size-6" /></span>
        <p className={cn("font-semibold", accent ? "text-indigo-100" : "text-muted-foreground")}>{label}</p>
        <p className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums">{value}</p>
        {sub && <p className={cn("mt-1 text-sm", accent ? "text-indigo-100" : "text-muted-foreground")}>{sub}</p>}
      </Card>
    </motion.div>
  );
}

function Empty({ icon: Icon, title, text, action }: { icon: typeof Inbox; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center">
      <span className="mb-4 grid size-16 place-items-center rounded-3xl bg-primary-soft text-primary"><Icon className="size-8" /></span>
      <p className="text-xl font-bold">{title}</p>
      <p className="mt-1 max-w-md text-muted-foreground">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { config } = useApp();
  const [data, setData] = React.useState<Dashboard | null>(null);
  const [runs, setRuns] = React.useState<RunRow[] | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const rate = config?.fcfaPerUsd ?? 600;

  const load = React.useCallback(() => {
    api<Dashboard>("/api/dashboard").then(setData).catch((e) => toast.error(e.message));
    api<RunRow[]>("/api/runs").then(setRuns).catch(() => {});
  }, []);
  React.useEffect(load, [load]);

  // Mock engagement grows over time, so refresh every 15 seconds
  React.useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useLiveEvents((e) => {
    if (e.type === "report") setGenerating(false);
    if (["post", "report", "run", "decision", "cost"].includes(e.type)) load();
  });

  const generateReport = async () => {
    setGenerating(true);
    try {
      await api("/api/reports", { method: "POST" });
      // Stop the spinner if n8n never answers
      setTimeout(() => setGenerating((g) => { if (g) toast.error("The report is taking long. Check the Weekly report workflow in n8n."); return false; }), 90000);
    } catch (err) {
      toast.error((err as Error).message);
      setGenerating(false);
    }
  };

  const chartRows = (data?.posts ?? [])
    .filter((p) => p.engagement?.available)
    .slice(0, 8)
    .map((p) => ({
      name: `${p.platform === "facebook" ? "FB" : "LI"} · ${(p.title ?? "Post").length > 26 ? (p.title ?? "").slice(0, 25) + "…" : p.title ?? "Post"}`,
      likes: p.engagement!.likes, comments: p.engagement!.comments, shares: p.engagement!.shares,
      total: p.engagement!.likes + p.engagement!.comments + p.engagement!.shares, mock: p.engagement!.mock,
    }));

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-lg text-muted-foreground">Everything the agent drafted, what you approved, and how it performed.</p>
        </div>
        <Button asChild variant="accent" size="lg"><Link href="/"><PenLine /> New brief</Link></Button>
      </div>

      {!data ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-3xl" />)}</div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={Rocket} label="Posts published" value={data.stats.published} sub={`${data.stats.scheduled} scheduled · ${data.stats.failed} failed`} delay={0} />
          <Stat icon={CheckCircle2} label="Approval rate" value={data.stats.approvalRate == null ? "–" : `${Math.round(data.stats.approvalRate * 100)}%`} sub={`${data.stats.decisions} human decisions`} delay={0.05} />
          <Stat icon={Heart} label="Engagement" value={data.stats.engagement.toLocaleString("en-US")} sub="Likes, comments and shares" delay={0.1} />
          <Stat icon={Coins} label="AI cost today" value={formatFcfa(data.costs.todayUsd, rate)} sub={formatUsd(data.costs.todayUsd)} accent delay={0.15} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="size-5 text-primary" /> Engagement per post</CardTitle>
            <CardDescription>Likes + comments + shares. Facebook numbers from the Graph API (or mock). LinkedIn: not available.</CardDescription>
          </CardHeader>
          <CardContent>
            {!data ? <Skeleton className="h-64" /> : chartRows.length ? <EngagementChart rows={chartRows} /> : (
              <Empty icon={ThumbsUp} title="No engagement yet" text="Publish a post and its likes, comments and shares will appear here." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><FileText className="size-5 text-primary" /> Weekly reports</CardTitle>
              <CardDescription>Written by the agent in plain English. Also sent every Monday at 08:00.</CardDescription>
            </div>
            <Button variant="primary" loading={generating} onClick={generateReport}>{!generating && <Sparkles />} Generate weekly report</Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            <AnimatePresence>
              {generating && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="grid gap-2 rounded-2xl bg-muted p-4">
                  <p className="flex items-center gap-2 font-semibold"><Loader2 className="size-5 animate-spin text-primary" /> The agent is writing the report…</p>
                  <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" />
                </motion.div>
              )}
            </AnimatePresence>
            {!data ? <Skeleton className="h-40" /> : data.reports.length === 0 && !generating ? (
              <Empty icon={FileText} title="No report yet" text="Click Generate weekly report to see what worked this week." />
            ) : (
              data.reports.map((r, i) => (
                <motion.details key={r.id} open={i === 0} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group rounded-2xl border border-border p-4 open:bg-primary-soft/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <span className="text-lg font-bold">{r.title}</span>
                    <span className="text-sm text-muted-foreground">{timeAgo(r.createdAt)}</span>
                  </summary>
                  <p className="mt-3 whitespace-pre-line text-base leading-relaxed">{r.text}</p>
                </motion.details>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Posts</CardTitle>
          <CardDescription>Every approved post, its status and engagement.</CardDescription>
        </CardHeader>
        <CardContent>
          {!data ? <Skeleton className="h-40" /> : data.posts.length === 0 ? (
            <Empty icon={Inbox} title="Nothing published yet" text="Run the agent on a brief, approve a draft and publish it." action={<Button asChild variant="accent"><Link href="/"><PenLine /> Write a brief</Link></Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-sm uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-3 pr-4">Post</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4 text-right">Likes</th>
                    <th className="py-3 pr-4 text-right">Comments</th><th className="py-3 pr-4 text-right">Shares</th><th className="py-3 pr-4 text-right">Reach</th><th className="py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.posts.map((p) => {
                    const s = postStatus(p);
                    const e = p.engagement;
                    const num = (v?: number) => (e?.available ? v?.toLocaleString("en-US") : <span className="text-sm text-muted-foreground">n/a</span>);
                    return (
                      <tr key={p.id} className="border-b border-border/70 last:border-0 hover:bg-muted/50">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <PlatformIcon platform={p.platform} />
                            <div className="min-w-0">
                              <Link href={`/runs/${p.runId}`} className="font-bold hover:underline">{p.title ?? "Post"}</Link>
                              <p className="max-w-md truncate text-sm text-muted-foreground">{p.text}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge tone={s.tone}>{s.label}</Badge>
                          {p.mock && <span className="ml-2 text-xs font-semibold uppercase text-muted-foreground">mock</span>}
                          <p className="mt-1 text-sm text-muted-foreground">{p.status === "scheduled" && p.scheduledAt ? formatDateTime(p.scheduledAt) : timeAgo(p.publishedAt ?? p.createdAt)}</p>
                        </td>
                        <td className="py-3 pr-4 text-right text-lg font-bold tabular-nums">{e ? num(e.likes) : "–"}</td>
                        <td className="py-3 pr-4 text-right text-lg font-bold tabular-nums">{e ? num(e.comments) : "–"}</td>
                        <td className="py-3 pr-4 text-right text-lg font-bold tabular-nums">{e ? num(e.shares) : "–"}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{e?.available && e.reach ? e.reach.toLocaleString("en-US") : "–"}</td>
                        <td className="py-3 text-right">
                          {p.url && <Button asChild variant="ghost" size="sm"><a href={p.url} target="_blank" rel="noreferrer">Open <ExternalLink /></a></Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Agent runs</CardTitle></CardHeader>
        <CardContent>
          {!runs ? <Skeleton className="h-32" /> : runs.length === 0 ? (
            <Empty icon={PenLine} title="No runs yet" text="Each brief you give the agent appears here." />
          ) : (
            <ul className="grid gap-2">
              {runs.map((r) => {
                const st = RUN_STATUS[r.status] ?? { label: r.status, tone: "neutral" as const };
                return (
                  <li key={r.id}>
                    <Link href={`/runs/${r.id}`} className="flex flex-wrap items-center gap-4 rounded-2xl p-3 hover:bg-muted">
                      <span className="flex gap-1">{r.platforms.map((p) => <PlatformIcon key={p} platform={p} className="size-7 text-sm" />)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{r.title ?? "Untitled run"}</span>
                        <span className="text-sm text-muted-foreground">{r.organisation} · {timeAgo(r.createdAt)}</span>
                      </span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <span className="w-28 text-right text-sm font-semibold tabular-nums text-muted-foreground">{formatFcfa(r.costUsd, rate)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {data && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="flex flex-wrap items-center gap-6 border-transparent bg-gradient-to-r from-[#312E81] via-primary to-[#0EA5E9] p-8 text-white">
            <span className="grid size-16 place-items-center rounded-3xl bg-white/15"><Coins className="size-8 text-orange-300" /></span>
            <div className="flex-1">
              <p className="text-lg font-semibold text-indigo-100">Total AI cost of this demo</p>
              <p className="text-5xl font-extrabold tracking-tight tabular-nums">{formatFcfa(data.costs.totalUsd, rate)}</p>
            </div>
            <p className="text-xl font-semibold text-indigo-100">{formatUsd(data.costs.totalUsd)} on OpenRouter</p>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
