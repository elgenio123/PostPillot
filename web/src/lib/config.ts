import fs from "node:fs";
import path from "node:path";

export const PROMPTS_DIR = process.env.PROMPTS_DIR ?? path.resolve(process.cwd(), "../prompts");
export const CONFIG_DIR = process.env.CONFIG_DIR ?? path.resolve(process.cwd(), "../config");

export const PLATFORMS = ["facebook", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];

// Stable n8n workflow IDs, also used in n8n/workflows/*.json
export const WORKFLOWS = {
  generate: "ppGenerateDrafts",
  redraft: "ppRedraftPost001",
  approval: "ppTelegramApprov",
  publish: "ppPublishPost001",
  report: "ppWeeklyReport01",
} as const;

export interface ModelOption { id: string; label: string; note?: string }
export interface Example { title: string; organisation: string; preset: string; brief: string }
export interface Preset { id: string; label: string; text: string }

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(/* turbopackIgnore: true */ CONFIG_DIR, file), "utf8")) as T;
}

export function models(): { default: string; models: ModelOption[] } {
  return readJson("models.json");
}

export function examples(): Example[] {
  return readJson("examples.json");
}

export function presets(): Preset[] {
  const dir = path.join(/* turbopackIgnore: true */ PROMPTS_DIR, "presets");
  return fs
    .readdirSync(/* turbopackIgnore: true */ dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const text = fs.readFileSync(path.join(/* turbopackIgnore: true */ dir, f), "utf8").trim();
      // First line looks like "Brand voice: Formal school."
      const label = text.split("\n")[0].replace(/^Brand voice:\s*/i, "").replace(/\.$/, "");
      return { id: f.replace(/\.md$/, ""), label, text };
    });
}

// All prompt files keyed by name, e.g. { "draft-system": "...", "platform-facebook": "..." }
export function prompts(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fs.readdirSync(/* turbopackIgnore: true */ PROMPTS_DIR)) {
    if (f.endsWith(".md")) out[f.replace(/\.md$/, "")] = fs.readFileSync(path.join(/* turbopackIgnore: true */ PROMPTS_DIR, f), "utf8").trim();
  }
  return out;
}

// Same default as the Generate drafts workflow: the cheapest video model on OpenRouter that supports 5 to 10 s
export const DEFAULT_VIDEO_MODEL = "x-ai/grok-imagine-video-1.5-lite";

export const fcfaPerUsd = () => Number(process.env.FCFA_PER_USD ?? 600);
export const n8nPublicUrl = () => (process.env.N8N_WEBHOOK_URL ?? "http://localhost:5678/").replace(/\/$/, "");
export const appInternalUrl = () => process.env.APP_INTERNAL_URL ?? "http://web:3000";
