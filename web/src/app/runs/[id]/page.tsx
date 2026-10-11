"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Bot, ExternalLink, ImageIcon, Rocket, Send, ShieldCheck, Target, Workflow } from "lucide-react";
import { useLiveEvents } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/fields";
import { Tip } from "@/components/ui/controls";
import { Timeline } from "@/components/run/timeline";
import { Review } from "@/components/run/review";
import { Publish } from "@/components/run/publish";
import type { RunDetail } from "@/lib/types";
import { api, cn } from "@/lib/utils";

type Stage = "work" | "review" | "publish";
const STAGES: { id: Stage; label: string; icon: typeof Bot }[] = [
  { id: "work", label: "Agent at work", icon: Bot },
  { id: "review", label: "Review & approve", icon: ShieldCheck },
  { id: "publish", label: "Publish", icon: Rocket },
];

const stageFor = (status: string): Stage => (status === "approved" || status === "published" ? "publish" : status === "awaiting_approval" ? "review" : "work");

const SOURCE_LABEL = { openrouter: "OpenRouter AI", pollinations: "Pollinations.ai", template: "Branded template" };

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = React.useState<RunDetail | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [stage, setStage] = React.useState<Stage>("work");
  const lastStatus = React.useRef<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = React.useCallback(async () => {
    try {
      const r = await api<RunDetail>(`/api/runs/${id}`);
      setRun(r);
      // Move to the next stage automatically when the run status changes
      if (r.status !== lastStatus.current) {
        const next = stageFor(r.status);
        // Leave time for the approval celebration before switching to Publish
        if (lastStatus.current === "awaiting_approval" && next === "publish") setTimeout(() => setStage(next), 1600);
        else setStage(next);
        lastStatus.current = r.status;
      }
    } catch (err) {
      if ((err as { status?: number }).status === 404) setMissing(true);
    }
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  // Refetch when anything about this run changes; bursts of events are merged
  useLiveEvents((e) => {
    if (e.runId !== id) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 120);
  });

  // Safety net in case a live update is missed
  React.useEffect(() => {
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  if (missing) {
    return (
      <Card className="mx-auto max-w-xl p-10 text-center">
        <p className="text-2xl font-bold">This run does not exist</p>
        <Button asChild variant="primary" className="mt-6"><Link href="/"><ArrowLeft /> New brief</Link></Button>
      </Card>
    );
  }

  if (!run) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-14 w-2/3" />
        <div className="grid gap-6 xl:grid-cols-[1fr_520px]"><Skeleton className="h-[520px] rounded-3xl" /><Skeleton className="h-[420px] rounded-3xl" /></div>
      </div>
    );
  }

  const imageStep = run.events.filter((e) => e.step === "image").at(-1);
  const approvedCount = run.platforms.filter((p) => run.drafts.filter((d) => d.platform === p).at(-1)?.status === "approved").length;
  const stageEnabled = (s: Stage) => s === "work" || run.drafts.length > 0;

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="primary">{run.organisation}</Badge>
            <Badge tone={run.mock ? "accent" : "primary"}><Send /> {run.mock ? "Mock publishing" : "Real publishing"}</Badge>
            {run.trap && <Badge tone="danger"><Target /> Demo trap on</Badge>}
            <Badge><Bot /> {run.model}</Badge>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{run.title ?? "New post run"}</h1>
        </div>
        <Tip content="Opens this run in the n8n editor (log in with the n8n owner account)">
          <Button asChild variant="secondary" size="lg">
            <a href={run.executionUrl ?? run.workflowUrl} target="_blank" rel="noreferrer"><Workflow /> See the workflow <ExternalLink className="opacity-60" /></a>
          </Button>
        </Tip>
      </div>

      <nav className="grid gap-3 sm:grid-cols-3" aria-label="Steps">
        {STAGES.map((s, i) => {
          const active = stage === s.id;
          const enabled = stageEnabled(s.id);
          return (
            <button
              key={s.id}
              disabled={!enabled}
              onClick={() => setStage(s.id)}
              className={cn(
                "relative flex items-center gap-4 overflow-hidden rounded-2xl border-2 p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50",
                active ? "border-primary bg-card shadow-lift" : "border-transparent bg-muted hover:bg-card",
              )}
            >
              <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl text-lg font-extrabold", active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
                {i + 1}
              </span>
              <span>
                <span className="block text-lg font-bold">{s.label}</span>
                <span className="text-sm text-muted-foreground">
                  {s.id === "work" && (run.status === "generating" ? "Running…" : run.status === "failed" ? "Stopped with an error" : "Finished")}
                  {s.id === "review" && `${approvedCount} of ${run.platforms.length} approved`}
                  {s.id === "publish" && `${run.posts.filter((p) => p.status === "published").length} published`}
                </span>
              </span>
              {active && <motion.span layoutId="stage-bar" className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary via-[#0EA5E9] to-accent" />}
            </button>
          );
        })}
      </nav>

      <AnimatePresence mode="wait">
        <motion.div key={stage} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
          {stage === "work" && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px]">
              <Card className="p-7">
                <Timeline run={run} />
                {run.error && <p className="mt-2 rounded-2xl bg-danger-soft p-4 text-danger"><strong>The run stopped:</strong> {run.error}</p>}
                {run.status !== "generating" && run.drafts.length > 0 && (
                  <div className="flex justify-end">
                    <Button variant="accent" size="lg" onClick={() => setStage("review")}>Review the drafts <ArrowRight /></Button>
                  </div>
                )}
              </Card>
              <div className="grid content-start gap-6">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon className="size-5 text-primary" /> Event image</CardTitle></CardHeader>
                  <CardContent>
                    {run.image ? (
                      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
                        <img src={run.image.original} alt="Generated event illustration" className="aspect-[1200/630] w-full rounded-2xl object-cover shadow-soft" />
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Badge tone={run.image.source === "template" ? "neutral" : "primary"}>{SOURCE_LABEL[run.image.source]}</Badge>
                          {run.image.note && <span className="text-sm text-muted-foreground">{run.image.note}</span>}
                        </div>
                      </motion.div>
                    ) : (
                      <div className="relative aspect-[1200/630] overflow-hidden rounded-2xl">
                        <Skeleton className="absolute inset-0 rounded-2xl" />
                        <span className="absolute inset-0 grid place-items-center font-semibold text-muted-foreground">
                          {imageStep?.status === "running" ? "Painting the image…" : "The image comes after the drafts"}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>The brief</CardTitle></CardHeader>
                  <CardContent><p className="whitespace-pre-line text-lg leading-relaxed text-muted-foreground">{run.brief}</p></CardContent>
                </Card>
              </div>
            </div>
          )}
          {stage === "review" && (
            <div className="grid gap-6">
              <Review run={run} onChanged={load} />
              {approvedCount > 0 && (
                <div className="flex justify-end">
                  <Button variant="accent" size="lg" onClick={() => setStage("publish")}>Go to publishing <ArrowRight /></Button>
                </div>
              )}
            </div>
          )}
          {stage === "publish" && <Publish run={run} onChanged={load} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
