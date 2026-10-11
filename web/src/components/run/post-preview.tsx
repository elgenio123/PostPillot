"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Globe2, MessageCircle, Repeat2, Send, Share2, ThumbsUp } from "lucide-react";
import { Tip } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/fields";
import type { SafetyFlag } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY: Record<string, string> = {
  student_name: "Student name",
  minor_photo: "Photo of minors",
  personal_data: "Personal data",
  unverifiable_promise: "Promise not in brief",
  fact_mismatch: "Does not match the brief",
  tone: "Tone",
};
export const flagLabel = (c: string) => CATEGORY[c] ?? "Check this";

type Mark = { start: number; end: number; kind: "flag" | "trap"; tip: string };

// Wraps flagged quotes (and the revealed trap) in highlighted spans
export function HighlightedText({ text, flags, trap }: { text: string; flags: SafetyFlag[]; trap?: { quote: string; explanation: string } | null }) {
  const lower = text.toLowerCase();
  const marks: Mark[] = [];
  const add = (quote: string, kind: Mark["kind"], tip: string) => {
    const q = quote.trim().toLowerCase();
    if (!q) return;
    const start = lower.indexOf(q);
    if (start >= 0 && !marks.some((m) => start < m.end && start + q.length > m.start)) marks.push({ start, end: start + q.length, kind, tip });
  };
  if (trap) add(trap.quote, "trap", `Planted mistake: ${trap.explanation}`);
  flags.forEach((f) => add(f.quote, "flag", `${flagLabel(f.category)}: ${f.explanation}`));
  marks.sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let pos = 0;
  marks.forEach((m, i) => {
    if (m.start > pos) parts.push(text.slice(pos, m.start));
    parts.push(
      <Tip key={i} content={m.tip} side="top">
        <mark className={cn(
          "cursor-help rounded-md px-1 py-0.5 font-semibold",
          m.kind === "trap" ? "bg-danger/15 text-danger underline decoration-danger decoration-wavy decoration-2 underline-offset-4" : "bg-warning/20 text-foreground underline decoration-warning decoration-2 underline-offset-4",
        )}>
          {text.slice(m.start, m.end)}
        </mark>
      </Tip>,
    );
    pos = m.end;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return <p className="whitespace-pre-line text-[1.05rem] leading-relaxed">{parts}</p>;
}

function Avatar({ name, square }: { name: string; square?: boolean }) {
  const initials = name.split(/\s+/).filter((w) => /^[A-ZÀ-Ý]/.test(w)).slice(0, 2).map((w) => w[0]).join("") || "PP";
  return (
    <span className={cn("grid size-12 shrink-0 place-items-center bg-gradient-to-br from-[#3730A3] to-[#0284C7] text-lg font-extrabold text-white", square ? "rounded-xl" : "rounded-full")}>
      {initials}
    </span>
  );
}

function PostImage({ src, loading }: { src?: string | null; loading?: boolean }) {
  if (loading || !src) {
    return (
      <div className="relative aspect-[1200/630] w-full overflow-hidden">
        <Skeleton className="absolute inset-0 rounded-none" />
        <span className="absolute inset-0 grid place-items-center text-sm font-semibold text-muted-foreground">{loading ? "Painting the image…" : "No image"}</span>
      </div>
    );
  }
  return <motion.img key={src} src={src} alt="Event illustration" initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="aspect-[1200/630] w-full object-cover" />;
}

export function FacebookPreview({ organisation, children, image, imageLoading }: { organisation: string; children: React.ReactNode; image?: string | null; imageLoading?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-3 p-4">
        <Avatar name={organisation} />
        <div className="min-w-0">
          <p className="truncate font-bold">{organisation}</p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">Just now · <Globe2 className="size-3.5" /></p>
        </div>
      </div>
      <div className="px-4 pb-3">{children}</div>
      <PostImage src={image} loading={imageLoading} />
      <div className="flex items-center justify-between px-4 py-2.5 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="grid size-5 place-items-center rounded-full bg-[#1877F2] text-white"><ThumbsUp className="size-3" /></span> Be the first to react</span>
        <span>0 comments</span>
      </div>
      <div className="mx-4 grid grid-cols-3 border-t border-border py-1 text-muted-foreground">
        {[{ i: ThumbsUp, l: "Like" }, { i: MessageCircle, l: "Comment" }, { i: Share2, l: "Share" }].map(({ i: I, l }) => (
          <span key={l} className="flex items-center justify-center gap-2 rounded-lg py-2 font-semibold"><I className="size-5" />{l}</span>
        ))}
      </div>
    </div>
  );
}

export function LinkedInPreview({ organisation, children, image, imageLoading }: { organisation: string; children: React.ReactNode; image?: string | null; imageLoading?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-3 p-4">
        <Avatar name={organisation} square />
        <div className="min-w-0">
          <p className="truncate font-bold">{organisation}</p>
          <p className="text-sm text-muted-foreground">Education · 1,240 followers</p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">Now · <Globe2 className="size-3.5" /></p>
        </div>
      </div>
      <div className="px-4 pb-3">{children}</div>
      <PostImage src={image} loading={imageLoading} />
      <div className="mx-4 grid grid-cols-4 border-t border-border py-1 text-muted-foreground">
        {[{ i: ThumbsUp, l: "Like" }, { i: MessageCircle, l: "Comment" }, { i: Repeat2, l: "Repost" }, { i: Send, l: "Send" }].map(({ i: I, l }) => (
          <span key={l} className="flex items-center justify-center gap-2 rounded-lg py-2 font-semibold"><I className="size-5" />{l}</span>
        ))}
      </div>
    </div>
  );
}
