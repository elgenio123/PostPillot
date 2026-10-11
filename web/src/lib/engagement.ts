import type { Post } from "./types";

export interface Engagement { likes: number; comments: number; shares: number; reach: number; available: boolean; mock: boolean }

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
}

// Fake numbers that grow quickly during the first minutes, then level off, so the demo shows movement
export function mockEngagement(post: Pick<Post, "id" | "publishedAt">, at = new Date()): Engagement {
  if (!post.publishedAt) return { likes: 0, comments: 0, shares: 0, reach: 0, available: true, mock: true };
  const minutes = Math.max(0, (at.getTime() - new Date(post.publishedAt).getTime()) / 60000);
  const k = 0.6 + hash(post.id) * 0.9;
  const likes = Math.round(k * (4 + 90 * (1 - Math.exp(-minutes / 25)) + minutes * 0.4));
  return {
    likes,
    comments: Math.round(likes / (5 + hash(post.id + "c") * 3)),
    shares: Math.round(likes / (7 + hash(post.id + "s") * 4)),
    reach: Math.round(likes * (12 + hash(post.id + "r") * 8)),
    available: true,
    mock: true,
  };
}

const cache = new Map<string, { at: number; value: Engagement }>();

// Real Facebook numbers from the Graph API, cached for a minute
export async function facebookEngagement(externalId: string): Promise<Engagement> {
  const hit = cache.get(externalId);
  if (hit && Date.now() - hit.at < 60000) return hit.value;
  const version = process.env.FB_GRAPH_VERSION ?? "v23.0";
  const token = process.env.FB_PAGE_TOKEN ?? "";
  const empty: Engagement = { likes: 0, comments: 0, shares: 0, reach: 0, available: false, mock: false };
  try {
    const fields = "reactions.summary(total_count),comments.summary(total_count),shares";
    const res = await fetch(`https://graph.facebook.com/${version}/${externalId}?fields=${fields}&access_token=${token}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return empty;
    const j = await res.json();
    const value: Engagement = {
      likes: j.reactions?.summary?.total_count ?? 0,
      comments: j.comments?.summary?.total_count ?? 0,
      shares: j.shares?.count ?? 0,
      reach: 0,
      available: true,
      mock: false,
    };
    cache.set(externalId, { at: Date.now(), value });
    return value;
  } catch {
    return empty;
  }
}

export async function engagementFor(post: Post): Promise<Engagement | null> {
  if (post.status !== "published" && !(post.status === "scheduled" && post.platform === "facebook" && !post.mock && post.scheduledAt && new Date(post.scheduledAt) < new Date())) return null;
  if (post.mock) return mockEngagement(post);
  // LinkedIn statistics need a partner API, so they are shown as not available
  if (post.platform === "linkedin" || !post.externalId) return { likes: 0, comments: 0, shares: 0, reach: 0, available: false, mock: false };
  return facebookEngagement(post.externalId);
}
