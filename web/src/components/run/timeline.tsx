"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, BookOpenText, Check, Clapperboard, Clock, ImageIcon, Loader2, PenLine, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { stepLabel, timelineSteps, type RunDetail, type StepStatus } from "@/lib/types";
import { TypeText } from "./type-text";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Check> = {
  brief: BookOpenText, draft_facebook: PenLine, draft_linkedin: PenLine, image: ImageIcon,
  safety: ShieldCheck, approval: Send, redraft_facebook: RefreshCw, redraft_linkedin: RefreshCw,
};

interface StepView { step: string; status: StepStatus; messages: { id: number; text: string }[]; seconds: number | null; startedAt: number | null }

function buildSteps(run: RunDetail): StepView[] {
  const extra = Array.from(new Set(run.events.filter((e) => e.step.startsWith("redraft_")).map((e) => e.step)));
  return [...timelineSteps(run.platforms), ...extra].map((step) => {
    const evs = run.events.filter((e) => e.step === step);
    const last = evs.at(-1);
    const first = evs.find((e) => e.status === "running") ?? evs[0];
    const end = [...evs].reverse().find((e) => e.status === "done" || e.status === "failed");
    // Redraft steps run again for every rejection, so their duration uses the latest round
    const lastStart = [...evs].reverse().find((e) => e.status === "running") ?? first;
    const startEv = step.startsWith("redraft_") ? lastStart : first;
    const seconds = startEv && end && new Date(end.createdAt) >= new Date(startEv.createdAt)
      ? (new Date(end.createdAt).getTime() - new Date(startEv.createdAt).getTime()) / 1000 : null;
    return {
      step,
      status: (last?.status as StepStatus) ?? "waiting",
      messages: evs.filter((e) => e.message).map((e) => ({ id: e.id, text: e.message! })),
      seconds: last?.status === "running" ? null : seconds,
      startedAt: last?.status === "running" && startEv ? new Date(startEv.createdAt).getTime() : null,
    };
  });
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  return <>{Math.max(0, (now - since) / 1000).toFixed(1)}s</>;
}

export function Timeline({ run }: { run: RunDetail }) {
  const steps = buildSteps(run);
  const draftFor = (step: string) => {
    const platform = step.replace(/^(re)?draft_/, "");
    const versions = run.drafts.filter((d) => d.platform === platform);
    return step.startsWith("redraft_") ? versions.at(-1) : versions[0];
  };

  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const Icon = s.step === "image" && run.media === "video" ? Clapperboard : ICONS[s.step] ?? Check;
        const draft = s.step.includes("draft_") && s.status === "done" ? draftFor(s.step) : undefined;
        const isLast = i === steps.length - 1;
        return (
          <motion.li
            key={s.step}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="relative flex gap-3 pb-6 sm:gap-5 sm:pb-7"
          >
            {!isLast && (
              <span className="absolute left-[20px] top-11 h-[calc(100%-2.75rem)] w-1 overflow-hidden rounded-full bg-border sm:left-[27px] sm:top-14 sm:h-[calc(100%-3.5rem)]" aria-hidden>
                <motion.span
                  className="block w-full rounded-full bg-gradient-to-b from-primary to-primary/50"
                  initial={{ height: 0 }}
                  animate={{ height: s.status === "done" ? "100%" : "0%" }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </span>
            )}
            <div className="relative shrink-0">
              <motion.span
                className={cn(
                  "relative z-10 grid size-11 place-items-center rounded-2xl border-2 transition-colors duration-500 sm:size-14",
                  s.status === "done" && "border-transparent bg-primary text-primary-foreground shadow-lift",
                  s.status === "running" && "border-primary bg-primary-soft text-primary",
                  s.status === "failed" && "border-danger bg-danger-soft text-danger",
                  s.status === "waiting" && "border-border bg-card text-muted-foreground",
                )}
                animate={s.status === "done" ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                {s.status === "running" ? <Loader2 className="size-6 animate-spin" /> : s.status === "done" ? <Check className="size-6" strokeWidth={3} /> : s.status === "failed" ? <X className="size-6" strokeWidth={3} /> : <Icon className="size-6" />}
              </motion.span>
              {s.status === "running" && <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/20" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h4 className={cn("text-base font-bold sm:text-xl", s.status === "waiting" && "text-muted-foreground")}>{stepLabel(s.step, run.media)}</h4>
                <span className={cn(
                  "rounded-full px-2.5 py-0.5 text-sm font-semibold",
                  s.status === "done" && "bg-success-soft text-success",
                  s.status === "running" && "bg-primary-soft text-primary",
                  s.status === "failed" && "bg-danger-soft text-danger",
                  s.status === "waiting" && "bg-muted text-muted-foreground",
                )}>
                  {s.status === "waiting" ? "Waiting" : s.status === "running" ? "Running" : s.status === "done" ? "Done" : "Failed"}
                </span>
                <span className="flex items-center gap-1 text-sm font-medium tabular-nums text-muted-foreground">
                  {(s.startedAt || s.seconds != null) && <Clock className="size-4" />}
                  {s.startedAt ? <Elapsed since={s.startedAt} /> : s.seconds != null ? `${s.seconds.toFixed(1)}s` : null}
                </span>
              </div>
              <AnimatePresence initial={false}>
                {s.messages.slice(-2).map((m) => (
                  <motion.p key={m.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className={cn("mt-1 text-sm sm:text-lg", s.status === "failed" ? "text-danger" : "text-muted-foreground")}>
                    {s.status === "failed" && <AlertTriangle className="mr-1.5 inline size-5" />}
                    <TypeText id={`m${m.id}`} text={m.text} duration={600} />
                  </motion.p>
                ))}
              </AnimatePresence>
              {draft && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-2xl border border-border bg-muted/60 p-3 text-sm leading-relaxed sm:p-4 sm:text-base">
                  <TypeText id={`d${draft.id}`} text={draft.text.length > 280 ? draft.text.slice(0, 280) + "…" : draft.text} className="whitespace-pre-line" />
                </motion.div>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
