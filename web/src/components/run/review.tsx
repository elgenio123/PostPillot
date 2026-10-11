"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, ShieldCheck, Smartphone, Target, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Label, Textarea } from "@/components/ui/fields";
import { PlatformIcon } from "@/components/platform-icons";
import { FacebookPreview, HighlightedText, LinkedInPreview, flagLabel } from "./post-preview";
import { celebrate } from "./celebrate";
import { PLATFORM_LABEL, type Draft, type RunDetail } from "@/lib/types";
import { api, cn } from "@/lib/utils";

const QUICK_REASONS = ["The date or time is wrong", "Too long, make it shorter", "More formal please", "Remove the promise that is not in the brief", "Add a clearer call to action"];

function DecisionBadge({ draft }: { draft: Draft }) {
  if (!draft.decision) return null;
  const from = draft.decision.source === "telegram" ? "from Telegram" : "in the app";
  return draft.decision.decision === "approve" ? (
    <Badge tone="success">{draft.decision.source === "telegram" ? <Smartphone /> : <CheckCircle2 />} Approved {from}</Badge>
  ) : (
    <Badge tone="danger">{draft.decision.source === "telegram" ? <Smartphone /> : <XCircle />} Rejected {from}</Badge>
  );
}

function RejectDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (v: boolean) => void; onSubmit: (reason: string) => Promise<void> }) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>What should the agent fix?</DialogTitle>
        <DialogDescription>Your reason is sent to the agent, which writes a new version.</DialogDescription>
        <div className="mt-5 flex flex-wrap gap-2">
          {QUICK_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold transition", reason === r ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-muted")}>
              {r}
            </button>
          ))}
        </div>
        <Label htmlFor="reason" className="mt-5">Reason</Label>
        <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-28 text-base" placeholder="e.g. The fair is on the 14th, not the 15th." autoFocus />
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try { await onSubmit(reason.trim()); onOpenChange(false); } finally { setBusy(false); }
            }}
          >
            <ThumbsDown /> Reject and redraft
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DraftCard({ run, platform, onChanged }: { run: RunDetail; platform: "facebook" | "linkedin"; onChanged: () => void }) {
  const versions = run.drafts.filter((d) => d.platform === platform);
  const latest = versions.at(-1);
  const [selected, setSelected] = React.useState<string | undefined>(latest?.id);
  const [editing, setEditing] = React.useState(false);
  const [editText, setEditText] = React.useState("");
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<"" | "approve" | "edit">("");
  const cardRef = React.useRef<HTMLDivElement>(null);
  const prevLatest = React.useRef(latest?.id);

  // Jump to the newest version when the agent delivers one
  React.useEffect(() => {
    if (latest?.id && latest.id !== prevLatest.current) {
      setSelected(latest.id);
      setEditing(false);
    }
    prevLatest.current = latest?.id;
  }, [latest?.id]);

  // Celebrate approvals that arrive from Telegram too
  const prevStatus = React.useRef(latest?.status);
  React.useEffect(() => {
    if (latest?.status === "approved" && prevStatus.current === "pending") celebrate(cardRef.current);
    prevStatus.current = latest?.status;
  }, [latest?.status]);

  const redrafting = run.events.filter((e) => e.step === `redraft_${platform}`).at(-1)?.status === "running";
  const draft = versions.find((d) => d.id === selected) ?? latest;
  const imageStep = run.events.filter((e) => e.step === "image").at(-1);
  const image = run.image ? (platform === "facebook" ? run.image.facebook : run.image.linkedin) : null;
  const Preview = platform === "facebook" ? FacebookPreview : LinkedInPreview;

  if (!draft) {
    return (
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-3"><PlatformIcon platform={platform} /><h3 className="text-xl font-bold">{PLATFORM_LABEL[platform]}</h3></div>
        <div className="grid gap-3"><div className="shimmer h-5 w-3/4 rounded" /><div className="shimmer h-5 w-full rounded" /><div className="shimmer h-5 w-2/3 rounded" /><div className="shimmer aspect-[1200/630] rounded-2xl" /></div>
      </Card>
    );
  }

  const decide = async (decision: "approve" | "reject", reason?: string) => {
    try {
      await api(`/api/drafts/${draft.id}/decision`, { method: "POST", json: { decision, reason } });
      onChanged();
    } catch (err) {
      const e = err as Error & { status?: number; body?: { existing?: string } };
      if (e.status === 409) toast.info(`Already decided: ${e.body?.existing ?? "by someone else"}`);
      else toast.error(e.message);
      onChanged();
    }
  };

  const saveEdit = async () => {
    setBusy("edit");
    try {
      await api(`/api/drafts/${draft.id}`, { method: "PATCH", json: { text: editText } });
      setEditing(false);
      toast.success("Saved as a new version");
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy("");
    }
  };

  const isLatest = draft.id === latest?.id;

  return (
    <motion.div ref={cardRef} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={cn("p-5 transition-shadow", draft.status === "approved" && "ring-2 ring-success/50")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PlatformIcon platform={platform} className="size-10 text-lg" />
            <div>
              <h3 className="text-xl font-bold">{PLATFORM_LABEL[platform]} post</h3>
              <p className="text-sm text-muted-foreground">
                {draft.source === "human_edit" ? "Edited by you" : draft.source === "redraft" ? "Rewritten by the agent" : "Written by the agent"}
              </p>
            </div>
          </div>
          {versions.length > 1 && (
            <Tabs value={draft.id} onValueChange={setSelected}>
              <TabsList>
                {versions.map((v) => (
                  <TabsTrigger key={v.id} value={v.id} className="flex items-center gap-1.5">
                    <span className={cn("size-2 rounded-full", v.status === "approved" ? "bg-success" : v.status === "rejected" ? "bg-danger" : v.status === "superseded" ? "bg-muted-foreground/40" : "bg-accent")} />
                    v{v.version}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={draft.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}>
            <Preview organisation={run.organisation} image={image} imageLoading={!image && imageStep?.status !== "done" && imageStep?.status !== "failed"}>
              {editing ? (
                <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-56 text-base" autoFocus />
              ) : (
                <HighlightedText text={draft.text} flags={draft.safetyFlags} trap={draft.trap} />
              )}
            </Preview>

            {draft.trap && (
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mt-4 flex gap-3 rounded-2xl border-2 border-danger/30 bg-danger-soft p-4">
                <Target className="mt-0.5 size-7 shrink-0 text-danger" />
                <div>
                  <p className="text-lg font-bold text-danger">Well caught! This was the demo trap.</p>
                  <p className="text-foreground">The agent planted: <strong>&ldquo;{draft.trap.quote}&rdquo;</strong>. {draft.trap.explanation}</p>
                  <p className="mt-1 text-sm text-muted-foreground">AI can sound confident and still be wrong. That is why a human approves every post.</p>
                </div>
              </motion.div>
            )}

            <div className="mt-4">
              {draft.safetyChecked && draft.safetyFlags.length === 0 && !draft.trap && (
                <p className="flex items-center gap-2 font-semibold text-success"><ShieldCheck className="size-5" /> Safety check passed</p>
              )}
              {!draft.safetyChecked && draft.status === "pending" && (
                <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" /> Safety check in progress…</p>
              )}
              {draft.safetyFlags.length > 0 && (
                <ul className="grid gap-2">
                  {draft.safetyFlags.map((f, i) => (
                    <li key={i} className="flex gap-3 rounded-2xl bg-warning-soft p-3">
                      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
                      <span><strong>{flagLabel(f.category)}:</strong> {f.explanation} <span className="text-muted-foreground">(&ldquo;{f.quote}&rdquo;)</span></span>
                    </li>
                  ))}
                </ul>
              )}
              {draft.decision?.reason && draft.decision.decision === "reject" && (
                <p className="mt-3 rounded-2xl bg-muted p-3"><strong>Your feedback:</strong> {draft.decision.reason}</p>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-5">
          {draft.status === "pending" && isLatest && !editing && (
            <>
              <Button variant="success" size="lg" onClick={() => decide("approve")}><ThumbsUp /> Approve</Button>
              <Button variant="secondary" size="lg" onClick={() => { setEditText(draft.text); setEditing(true); }}><Pencil /> Edit</Button>
              <Button variant="destructive" size="lg" onClick={() => setRejectOpen(true)}><ThumbsDown /> Reject</Button>
            </>
          )}
          {editing && (
            <>
              <Button variant="primary" size="lg" loading={busy === "edit"} onClick={saveEdit}>Save as new version</Button>
              <Button variant="ghost" size="lg" onClick={() => setEditing(false)}>Cancel</Button>
            </>
          )}
          {draft.status !== "pending" && (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
              <DecisionBadge draft={draft} />
            </motion.div>
          )}
          {draft.status === "superseded" && <Badge>Replaced by a newer version</Badge>}
          {redrafting && isLatest && (
            <Badge tone="accent"><Loader2 className="animate-spin" /> The agent is writing a new version…</Badge>
          )}
          {!isLatest && <Button variant="ghost" onClick={() => setSelected(latest?.id)}>Go to latest version</Button>}
        </div>
      </Card>
      <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} onSubmit={(reason) => decide("reject", reason)} />
    </motion.div>
  );
}

export function Review({ run, onChanged }: { run: RunDetail; onChanged: () => void }) {
  return (
    <div className={cn("grid gap-6", run.platforms.length > 1 && "xl:grid-cols-2")}>
      {run.platforms.map((p) => <DraftCard key={p} run={run} platform={p} onChanged={onChanged} />)}
    </div>
  );
}
