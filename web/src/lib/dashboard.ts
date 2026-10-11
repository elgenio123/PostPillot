import { all, get } from "./db";
import { toPost } from "./runs";
import { engagementFor, type Engagement } from "./engagement";
import type { Post } from "./types";

export interface DashboardPost extends Post { title: string | null; organisation: string; text: string; engagement: Engagement | null }

export interface Report { id: string; title: string; text: string; numbers: unknown; periodStart: string; periodEnd: string; createdAt: string }

export async function costs(runId?: string | null) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sum = async (where: string, ...p: string[]) =>
    Number((await get<{ t: number }>(`SELECT COALESCE(SUM(usd), 0) AS t FROM costs ${where}`, ...p))?.t ?? 0);
  const [runUsd, todayUsd, totalUsd] = await Promise.all([
    runId ? sum("WHERE run_id = ?", runId) : 0,
    sum("WHERE created_at >= ?", startOfDay.toISOString()),
    sum(""),
  ]);
  return { runUsd, todayUsd, totalUsd };
}

export async function dashboardPosts(sinceIso?: string): Promise<DashboardPost[]> {
  const rows = await all<Record<string, string | number | null>>(
    `SELECT p.*, r.title AS run_title, r.organisation AS organisation, d.text AS draft_text
     FROM posts p JOIN runs r ON r.id = p.run_id JOIN drafts d ON d.id = p.draft_id
     ${sinceIso ? "WHERE p.created_at >= ?" : ""} ORDER BY p.created_at DESC LIMIT 100`,
    ...(sinceIso ? [sinceIso] : []),
  );
  return Promise.all(
    rows.map(async (row) => {
      const post = toPost(row as never);
      return { ...post, title: row.run_title as string | null, organisation: row.organisation as string, text: row.draft_text as string, engagement: await engagementFor(post) };
    }),
  );
}

export async function reports(): Promise<Report[]> {
  return (await all<{ id: string; title: string; text: string; numbers: string; period_start: string; period_end: string; created_at: string }>(
    "SELECT * FROM reports ORDER BY created_at DESC LIMIT 20",
  )).map((r) => ({ id: r.id, title: r.title, text: r.text, numbers: JSON.parse(r.numbers), periodStart: r.period_start, periodEnd: r.period_end, createdAt: r.created_at }));
}

export async function dashboard() {
  const posts = await dashboardPosts();
  const decisions = (await get<{ total: number; approved: number }>(
    "SELECT COUNT(*)::int AS total, (COUNT(*) FILTER (WHERE decision = 'approve'))::int AS approved FROM decisions",
  ))!;
  const runsByStatus = await all<{ status: string; n: number }>("SELECT status, COUNT(*)::int AS n FROM runs GROUP BY status");
  const published = posts.filter((p) => p.engagement);
  const engagementTotal = published.reduce((s, p) => s + (p.engagement?.available ? p.engagement.likes + p.engagement.comments + p.engagement.shares : 0), 0);
  return {
    stats: {
      published: published.length,
      scheduled: posts.filter((p) => p.status === "scheduled" && !p.engagement).length,
      failed: posts.filter((p) => p.status === "failed").length,
      approvalRate: decisions.total ? decisions.approved / decisions.total : null,
      decisions: decisions.total,
      engagement: engagementTotal,
      runs: runsByStatus.reduce((s, r) => s + r.n, 0),
    },
    costs: await costs(),
    posts,
    reports: await reports(),
  };
}
