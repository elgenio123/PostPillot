// Shapes shared by the API and the browser

export type StepStatus = "waiting" | "running" | "done" | "failed";
export type DraftStatus = "pending" | "approved" | "rejected" | "superseded";
export type PostStatus = "publishing" | "scheduled" | "published" | "failed";

export interface SafetyFlag { quote: string; category: string; explanation: string }

export interface Draft {
  id: string;
  runId: string;
  platform: "facebook" | "linkedin";
  version: number;
  text: string;
  hashtags: string[];
  status: DraftStatus;
  source: "agent" | "redraft" | "human_edit";
  safetyFlags: SafetyFlag[];
  safetyChecked: boolean;
  reason: string | null;
  createdAt: string;
  // Only filled once the draft was rejected (the demo trap stays hidden before that)
  trap: { quote: string; explanation: string } | null;
  decision: { decision: "approve" | "reject"; reason: string | null; source: "app" | "telegram"; createdAt: string } | null;
}

export interface RunEvent { id: number; step: string; status: StepStatus; message: string | null; createdAt: string }

export interface Post {
  id: string;
  draftId: string;
  runId: string;
  platform: "facebook" | "linkedin";
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalId: string | null;
  url: string | null;
  mock: boolean;
  error: string | null;
  createdAt: string;
}

export interface RunImage { source: "openrouter" | "pollinations" | "template"; original: string; facebook: string; linkedin: string; note: string | null }

export type Media = "image" | "video";
// "openrouter" is a real AI video; "animated-*" means the AI video failed and an image was animated instead
export interface RunVideo { source: string; url: string; poster: string; seconds: number | null; note: string | null }

// Lengths offered on the brief page; the video model must support them (see VIDEO_MODEL in .env)
export const VIDEO_SOURCE_LABEL: Record<string, string> = {
  openrouter: "AI video",
  "animated-openrouter": "Animated AI image",
  "animated-pollinations": "Animated Pollinations image",
  "animated-template": "Animated template",
};

export const VIDEO_SECONDS = [5, 6, 8, 10] as const;

export interface RunDetail {
  id: string;
  brief: string;
  organisation: string;
  preset: string;
  platforms: ("facebook" | "linkedin")[];
  model: string;
  mock: boolean;
  telegram: boolean;
  trap: boolean;
  media: Media;
  videoSeconds: number | null;
  status: string;
  title: string | null;
  error: string | null;
  createdAt: string;
  executionUrl: string | null;
  workflowUrl: string;
  costUsd: number;
  drafts: Draft[];
  events: RunEvent[];
  image: RunImage | null;
  video: RunVideo | null;
  posts: Post[];
}

export interface AppConfig {
  models: { id: string; label: string; note?: string }[];
  defaultModel: string;
  presets: { id: string; label: string }[];
  examples: { title: string; organisation: string; preset: string; brief: string }[];
  fcfaPerUsd: number;
  n8nUrl: string;
  workflows: Record<string, string>;
  imageModel: string;
  videoModel: string;
}

export interface Settings { model: string; mock: boolean; telegram: boolean; trap: boolean }

export const STEP_LABELS: Record<string, string> = {
  brief: "Reading brief",
  draft_facebook: "Drafting Facebook post",
  draft_linkedin: "Drafting LinkedIn post",
  image: "Creating image",
  safety: "Safety check",
  approval: "Sent for approval",
  redraft_facebook: "Redrafting Facebook post",
  redraft_linkedin: "Redrafting LinkedIn post",
};

export const stepLabel = (step: string, media: Media = "image") =>
  step === "image" && media === "video" ? "Creating video" : STEP_LABELS[step] ?? step;

export function timelineSteps(platforms: string[]): string[] {
  return ["brief", ...platforms.map((p) => `draft_${p}`), "image", "safety", "approval"];
}

export const PLATFORM_LABEL = { facebook: "Facebook", linkedin: "LinkedIn" } as const;

// Facebook native scheduling window (Meta docs: 10 minutes to 30 days ahead)
export const SCHEDULE_RULES = {
  facebook: { minMinutes: 10, maxDays: 30 },
  linkedin: { minMinutes: 2, maxDays: 30 },
  mock: { minMinutes: 1, maxDays: 30 },
};

export function scheduleError(platform: "facebook" | "linkedin", mock: boolean, when: Date, nowDate = new Date()): string | null {
  const rule = mock ? SCHEDULE_RULES.mock : SCHEDULE_RULES[platform];
  const diffMin = (when.getTime() - nowDate.getTime()) / 60000;
  if (Number.isNaN(diffMin)) return "Please pick a valid date and time.";
  if (diffMin < rule.minMinutes) return `Pick a time at least ${rule.minMinutes} minute${rule.minMinutes > 1 ? "s" : ""} from now.`;
  if (diffMin > rule.maxDays * 24 * 60) return `Pick a time within the next ${rule.maxDays} days.`;
  return null;
}
