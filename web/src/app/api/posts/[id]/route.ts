import { NextResponse } from "next/server";
import { get } from "@/lib/db";
import { toPost } from "@/lib/runs";
import { engagementFor } from "@/lib/engagement";
import type { Ctx } from "@/lib/http";

export const dynamic = "force-dynamic";

// Used by the mock post page to look like a real published post
export async function GET(_req: Request, { params }: Ctx<{ id: string }>) {
  const row = await get<Record<string, unknown>>(
    `SELECT p.*, d.text AS draft_text, r.organisation AS organisation,
       (SELECT CASE WHEN p.platform = 'facebook' THEN i.facebook ELSE i.linkedin END FROM images i WHERE i.run_id = p.run_id ORDER BY i.created_at DESC LIMIT 1) AS image
     FROM posts p JOIN drafts d ON d.id = p.draft_id JOIN runs r ON r.id = p.run_id WHERE p.id = ?`,
    (await params).id,
  );
  if (!row) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  const post = toPost(row as never);
  return NextResponse.json({
    post,
    text: row.draft_text,
    organisation: row.organisation,
    image: row.image ? `/api/images/${row.image}` : null,
    engagement: await engagementFor(post),
  });
}
