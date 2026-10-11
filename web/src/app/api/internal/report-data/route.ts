import { NextResponse } from "next/server";
import { checkSecret } from "@/lib/auth";
import { dashboardPosts } from "@/lib/dashboard";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Everything the Weekly report workflow needs: settings and last week's posts.
// Mock posts come with their fake numbers; real Facebook posts are measured by n8n through the Graph API.
export async function GET(req: Request) {
  const denied = checkSecret(req);
  if (denied) return denied;
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 3600 * 1000);
  const posts = (await dashboardPosts(start.toISOString())).filter((p) => p.status !== "failed");
  return NextResponse.json({
    settings: await getSettings(),
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    posts: posts.map((p) => ({
      id: p.id, platform: p.platform, title: p.title, status: p.status, mock: p.mock, externalId: p.externalId,
      excerpt: p.text.slice(0, 160),
      needsFacebookStats: !p.mock && p.platform === "facebook" && !!p.externalId,
      engagement: p.mock ? p.engagement : null,
    })),
  });
}
