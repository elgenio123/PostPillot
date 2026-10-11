import { z } from "zod";
import { get, run } from "./db";
import { models } from "./config";

export const SettingsSchema = z.object({
  model: z.string().min(1),
  mock: z.boolean(),
  telegram: z.boolean(),
  trap: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export async function getSettings(): Promise<Settings> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'app'");
  // Mock publishing is the safe default for a demo
  const defaults: Settings = { model: models().default, mock: true, telegram: false, trap: false };
  if (!row) return defaults;
  return { ...defaults, ...(JSON.parse(row.value) as Partial<Settings>) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = SettingsSchema.parse({ ...(await getSettings()), ...patch });
  await run(
    "INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    JSON.stringify(next),
  );
  return next;
}
