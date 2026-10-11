"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, ExternalLink, Hourglass, Loader2, Rocket, XCircle } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/fields";
import { PlatformIcon } from "@/components/platform-icons";
import { celebrate } from "./celebrate";
import { PLATFORM_LABEL, SCHEDULE_RULES, scheduleError, type Post, type RunDetail } from "@/lib/types";
import { api, cn, formatDateTime } from "@/lib/utils";

// Value for <input type="datetime-local"> in local time
function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((new Date(to).getTime() - now) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return <span className="tabular-nums">{h ? `${h}h ` : ""}{m}m {String(sec).padStart(2, "0")}s</span>;
}

function PostResult({ post }: { post: Post }) {
  const realFbScheduled = post.status === "scheduled" && post.platform === "facebook" && !post.mock;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn(
      "flex flex-wrap items-center gap-4 rounded-2xl p-5",
      post.status === "published" && "bg-success-soft",
      post.status === "scheduled" && "bg-primary-soft",
      post.status === "publishing" && "bg-muted",
      post.status === "failed" && "bg-danger-soft",
    )}>
      {post.status === "published" && <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", bounce: 0.6 }}><CheckCircle2 className="size-12 text-success" /></motion.span>}
      {post.status === "scheduled" && <CalendarClock className="size-12 text-primary" />}
      {post.status === "publishing" && <Loader2 className="size-12 animate-spin text-muted-foreground" />}
      {post.status === "failed" && <XCircle className="size-12 text-danger" />}
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold">
          {post.status === "published" && "Published!"}
          {post.status === "scheduled" && (realFbScheduled ? "Scheduled on Facebook" : <>Publishing in <Countdown to={post.scheduledAt!} /></>)}
          {post.status === "publishing" && "Publishing…"}
          {post.status === "failed" && "Publishing failed"}
        </p>
        <p className="text-muted-foreground">
          {post.status === "scheduled" && `Planned for ${formatDateTime(post.scheduledAt!)}`}
          {post.status === "published" && (post.mock ? "Mock mode: a simulated post with fake engagement." : "Live on the platform.")}
          {post.status === "failed" && post.error}
        </p>
      </div>
      {post.url && (
        <Button asChild variant={post.status === "published" ? "success" : "secondary"} size="lg">
          {post.mock ? <Link href={post.url} target="_blank">View post <ExternalLink /></Link> : <a href={post.url} target="_blank" rel="noreferrer">View post <ExternalLink /></a>}
        </Button>
      )}
    </motion.div>
  );
}

function PublishCard({ run, platform, onChanged }: { run: RunDetail; platform: "facebook" | "linkedin"; onChanged: () => void }) {
  const { settings } = useApp();
  const draft = run.drafts.filter((d) => d.platform === platform && d.status === "approved").at(-1);
  const posts = run.posts.filter((p) => p.draftId === draft?.id);
  const active = posts.find((p) => p.status !== "failed");
  const lastFailed = posts.filter((p) => p.status === "failed").at(-1);
  const mock = settings?.mock ?? true;
  const rule = mock ? SCHEDULE_RULES.mock : SCHEDULE_RULES[platform];
  const [mode, setMode] = React.useState<"now" | "later">("now");
  const [when, setWhen] = React.useState(() => localInput(new Date(Date.now() + (rule.minMinutes + 2) * 60000)));
  const [busy, setBusy] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const error = mode === "later" ? scheduleError(platform, mock, new Date(when)) : null;

  const prev = React.useRef(active?.status);
  React.useEffect(() => {
    if (active?.status === "published" && prev.current && prev.current !== "published") celebrate(cardRef.current, true);
    prev.current = active?.status;
  }, [active?.status]);

  const publish = async () => {
    if (!draft || error) return;
    setBusy(true);
    try {
      const post = await api<Post>(`/api/drafts/${draft.id}/publish`, { method: "POST", json: { when: mode === "now" ? "now" : new Date(when).toISOString() } });
      if (post.status === "failed") toast.error(post.error ?? "Publishing failed");
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div ref={cardRef} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <PlatformIcon platform={platform} className="size-10 text-lg" />
          <h3 className="text-2xl font-bold">{PLATFORM_LABEL[platform]}</h3>
          <Badge tone={mock ? "accent" : "primary"} className="ml-auto">{mock ? "Mock publishing" : "Real publishing"}</Badge>
        </div>

        {!draft ? (
          <div className="grid place-items-center rounded-2xl border-2 border-dashed border-border p-10 text-center">
            <Hourglass className="mb-3 size-10 text-muted-foreground" />
            <p className="text-lg font-semibold">Waiting for your approval</p>
            <p className="text-muted-foreground">Approve the {PLATFORM_LABEL[platform]} draft in the Review step first.</p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex gap-4 rounded-2xl bg-muted/60 p-4">
              {run.image && <img src={platform === "facebook" ? run.image.facebook : run.image.linkedin} alt="" className="h-24 w-44 shrink-0 rounded-xl object-cover" />}
              <p className="line-clamp-4 whitespace-pre-line text-base">{draft.text}</p>
            </div>

            <AnimatePresence mode="wait">
              {active ? (
                <PostResult key={active.id} post={active} />
              ) : (
                <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="grid grid-cols-2 gap-3">
                    {([["now", Rocket, "Post now", "Publish immediately"], ["later", CalendarClock, "Schedule", "Pick a date and time"]] as const).map(([m, Icon, title, sub]) => (
                      <button key={m} type="button" onClick={() => { setMode(m); if (m === "later") setWhen(localInput(new Date(Date.now() + (rule.minMinutes + 2) * 60000))); }} className={cn("flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition", mode === m ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40")}>
                        <Icon className={cn("size-7", mode === m ? "text-primary" : "text-muted-foreground")} />
                        <span><span className="block text-lg font-bold">{title}</span><span className="text-sm text-muted-foreground">{sub}</span></span>
                      </button>
                    ))}
                  </div>
                  {mode === "later" && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
                      <Label htmlFor={`when-${platform}`}>Date and time</Label>
                      <Input id={`when-${platform}`} type="datetime-local" value={when} min={localInput(new Date())} onChange={(e) => setWhen(e.target.value)} aria-invalid={!!error} />
                      <p className={cn("mt-1.5 text-sm", error ? "font-semibold text-danger" : "text-muted-foreground")}>
                        {error ?? (mock
                          ? "Mock mode: the post appears at that time."
                          : platform === "facebook"
                            ? "Facebook schedules natively: between 10 minutes and 30 days ahead."
                            : "n8n waits until that time, then posts to LinkedIn. Keep the laptop running.")}
                      </p>
                    </motion.div>
                  )}
                  {lastFailed && <p className="mt-4 rounded-2xl bg-danger-soft p-3 text-danger"><strong>Last attempt failed:</strong> {lastFailed.error}</p>}
                  <Button variant="accent" size="lg" className="mt-5 w-full" loading={busy} disabled={!!error} onClick={publish}>
                    {mode === "now" ? <><Rocket /> Publish now</> : <><CalendarClock /> Schedule post</>}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </Card>
    </motion.div>
  );
}

export function Publish({ run, onChanged }: { run: RunDetail; onChanged: () => void }) {
  return (
    <div className={cn("grid gap-6", run.platforms.length > 1 && "xl:grid-cols-2")}>
      {run.platforms.map((p) => <PublishCard key={p} run={run} platform={p} onChanged={onChanged} />)}
    </div>
  );
}
