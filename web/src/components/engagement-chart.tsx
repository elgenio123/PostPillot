"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "@/components/app-provider";

export interface ChartRow { name: string; total: number; likes: number; comments: number; shares: number; mock: boolean }

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-lift">
      <p className="mb-1 font-bold text-foreground">{r.name}</p>
      <p className="text-muted-foreground">{r.likes} likes · {r.comments} comments · {r.shares} shares</p>
      {r.mock && <p className="mt-1 text-xs font-semibold text-muted-foreground">Mock numbers</p>}
    </div>
  );
}

// Single series (total engagement per post), so no legend: the card title names it
export function EngagementChart({ rows }: { rows: ChartRow[] }) {
  const { theme } = useApp();
  const bar = theme === "dark" ? "#7C83F0" : "#4F46E5";
  const grid = theme === "dark" ? "#26304f" : "#e2e8f0";
  const ink = theme === "dark" ? "#a5b4cf" : "#475569";
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 44 + 36)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
        <CartesianGrid horizontal={false} stroke={grid} strokeWidth={1} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: ink, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={250}
          axisLine={false}
          tickLine={false}
          // Single-line labels: Recharts' default tick wraps long text
          tick={(props) => {
            const { x, y, payload } = props as { x: number; y: number; payload: { value: string } };
            return <text x={x} y={y} dy={5} textAnchor="end" fill={ink} fontSize={13} fontWeight={600}>{payload.value}</text>;
          }}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: grid, opacity: 0.5 }} />
        <Bar dataKey="total" fill={bar} barSize={20} radius={[0, 4, 4, 0]} isAnimationActive>
          <LabelList dataKey="total" position="right" fill={theme === "dark" ? "#f1f5f9" : "#0f172a"} fontSize={13} fontWeight={700} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
