import { NextResponse } from "next/server";
import { z } from "zod";
import { checkSecret } from "@/lib/auth";
import { newId, now, run } from "@/lib/db";
import { addCost } from "@/lib/runs";
import { publish } from "@/lib/bus";
import { handler } from "@/lib/http";

const Schema = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
  numbers: z.unknown().optional(),
  periodStart: z.string(),
  periodEnd: z.string(),
  cost: z.coerce.number().optional().nullable(),
});

export const POST = handler(async (req: Request) => {
  const denied = checkSecret(req);
  if (denied) return denied;
  const b = Schema.parse(await req.json());
  const id = newId();
  await run(
    "INSERT INTO reports (id, title, text, numbers, period_start, period_end, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id, b.title, b.text, JSON.stringify(b.numbers ?? {}), b.periodStart, b.periodEnd, now(),
  );
  if (b.cost) await addCost(null, b.cost, "weekly report");
  publish({ type: "report", reportId: id });
  return NextResponse.json({ id });
});
