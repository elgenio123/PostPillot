"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { Info } from "lucide-react";
import { FacebookPreview, LinkedInPreview } from "@/components/run/post-preview";
import { Skeleton } from "@/components/ui/fields";
import type { Post } from "@/lib/types";
import { api } from "@/lib/utils";

interface Data { post: Post; text: string; organisation: string; image: string | null; engagement: { likes: number; comments: number; shares: number } | null }

// What a published post would look like; reached from "View post" in Mock mode
export default function MockPostPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = React.useState<Data | null>(null);

  React.useEffect(() => {
    const load = () => api<Data>(`/api/posts/${id}`).then(setData).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [id]);

  if (!data) return <div className="mx-auto max-w-2xl"><Skeleton className="h-[640px] rounded-3xl" /></div>;
  const Preview = data.post.platform === "facebook" ? FacebookPreview : LinkedInPreview;
  const e = data.engagement;

  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <p className="flex items-center gap-2 rounded-2xl bg-accent-soft p-4 font-semibold text-accent">
        <Info className="size-5 shrink-0" /> Mock mode: this is a simulated {data.post.platform === "facebook" ? "Facebook" : "LinkedIn"} post. Nothing was sent to the real platform.
      </p>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="shadow-lift rounded-2xl">
        <Preview organisation={data.organisation} image={data.image}>
          <p className="whitespace-pre-line text-[1.05rem] leading-relaxed">{data.text}</p>
        </Preview>
      </motion.div>
      {e && (
        <div className="grid grid-cols-3 gap-3 text-center">
          {[["Likes", e.likes], ["Comments", e.comments], ["Shares", e.shares]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-card p-4 shadow-soft">
              <p className="text-3xl font-extrabold tabular-nums">{v}</p>
              <p className="text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
