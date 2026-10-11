"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { BookOpenText, CheckCircle2, ChevronDown, ImageIcon, PenLine, Plane, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Menu, MenuContent, MenuItem, MenuTrigger, Select } from "@/components/ui/controls";
import { Input, Label, Skeleton, Textarea } from "@/components/ui/fields";
import { PlatformIcon } from "@/components/platform-icons";
import { api, cn } from "@/lib/utils";

const STEPS = [
  { icon: BookOpenText, title: "Reads your brief", text: "Only the facts you give. Nothing invented." },
  { icon: PenLine, title: "Drafts each post", text: "Short and friendly for Facebook, professional for LinkedIn." },
  { icon: ImageIcon, title: "Creates an image", text: "One picture, cropped for each platform." },
  { icon: ShieldCheck, title: "Checks for safety", text: "No student names, personal data or false promises." },
  { icon: UserCheck, title: "You decide", text: "Approve, edit or reject. Nothing is posted without you." },
];

export default function BriefPage() {
  const { config } = useApp();
  const router = useRouter();
  const [brief, setBrief] = React.useState("");
  const [organisation, setOrganisation] = React.useState("");
  const [preset, setPreset] = React.useState("formal-school");
  const [platforms, setPlatforms] = React.useState<("facebook" | "linkedin")[]>(["facebook", "linkedin"]);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const togglePlatform = (p: "facebook" | "linkedin", on: boolean) =>
    setPlatforms((cur) => (on ? Array.from(new Set([...cur, p])) : cur.filter((x) => x !== p)));

  const loadExample = (i: number) => {
    const ex = config!.examples[i];
    setBrief(ex.brief);
    setOrganisation(ex.organisation);
    setPreset(ex.preset);
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (brief.trim().length < 20) errs.brief = "Please describe the event in a few sentences.";
    if (organisation.trim().length < 2) errs.organisation = "Please enter the school or organisation name.";
    if (!platforms.length) errs.platforms = "Choose at least one platform.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/runs", { method: "POST", json: { brief, organisation, preset, platforms } });
      router.push(`/runs/${id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent">
              <Sparkles className="size-4" /> Step 1 · Brief the agent
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">What is happening at your school?</h1>
            <p className="mt-2 max-w-2xl text-lg text-muted-foreground">Describe the event in one paragraph. The agent will draft the posts and an image, and you stay the pilot.</p>
          </div>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="lg" disabled={!config}>
                <BookOpenText /> Load example <ChevronDown className="opacity-60" />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              {config?.examples.map((ex, i) => (
                <MenuItem key={ex.title} onSelect={() => loadExample(i)}>
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft font-bold text-primary">{i + 1}</span>
                  <span className="flex flex-col">
                    <span className="font-semibold">{ex.title}</span>
                    <span className="text-sm text-muted-foreground">{ex.organisation}</span>
                  </span>
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        </div>

        <Card className="p-7">
          <form onSubmit={submit} className="grid gap-6" noValidate>
            <div>
              <Label htmlFor="brief">Event brief</Label>
              <Textarea
                id="brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="e.g. Our annual science fair takes place on Friday 14 November from 9:00 to 15:00 in the school courtyard…"
                className="min-h-52 text-xl"
                aria-invalid={!!errors.brief}
              />
              <div className="mt-1.5 flex justify-between text-sm">
                <span className="font-medium text-danger">{errors.brief}</span>
                <span className="text-muted-foreground tabular-nums">{brief.length} characters</span>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <Label htmlFor="org">School / organisation</Label>
                <Input id="org" value={organisation} onChange={(e) => setOrganisation(e.target.value)} placeholder="e.g. Lycée Bilingue de Mvog-Betsi" aria-invalid={!!errors.organisation} />
                <span className="mt-1.5 block text-sm font-medium text-danger">{errors.organisation}</span>
              </div>
              <div>
                <Label>Brand voice</Label>
                {config ? (
                  <Select className="h-[3.25rem] w-full rounded-2xl text-lg" value={preset} onValueChange={setPreset} options={config.presets.map((p) => ({ value: p.id, label: p.label }))} />
                ) : (
                  <Skeleton className="h-[3.25rem] rounded-2xl" />
                )}
              </div>
            </div>

            <div>
              <Label>Platforms</Label>
              <div className="flex flex-wrap gap-3">
                {(["facebook", "linkedin"] as const).map((p) => {
                  const on = platforms.includes(p);
                  return (
                    <label key={p} className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-5 py-3.5 transition-all", on ? "border-primary bg-primary-soft" : "border-border bg-card hover:border-primary/40")}>
                      <Checkbox checked={on} onCheckedChange={(v) => togglePlatform(p, v === true)} />
                      <PlatformIcon platform={p} />
                      <span className="text-lg font-bold">{p === "facebook" ? "Facebook" : "LinkedIn"}</span>
                    </label>
                  );
                })}
              </div>
              <span className="mt-1.5 block text-sm font-medium text-danger">{errors.platforms}</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
              <p className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="size-5 text-success" /> Nothing is published until you approve it.
              </p>
              <Button type="submit" variant="accent" size="xl" loading={busy} className="min-w-64">
                {!busy && <Plane className="-rotate-12" />} Run agent
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>

      <motion.aside initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, delay: 0.1 }}>
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-[#3730A3] to-[#0284C7] p-7 text-white">
            <p className="text-sm font-bold uppercase tracking-widest text-indigo-200">How it works</p>
            <h2 className="mt-1 text-2xl font-extrabold">The agent flies. You are the pilot.</h2>
          </div>
          <ol className="relative grid gap-1 p-5">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.08 }}
                className="flex gap-4 rounded-2xl p-3 hover:bg-muted"
              >
                <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", i === STEPS.length - 1 ? "bg-accent-soft text-accent" : "bg-primary-soft text-primary")}>
                  <s.icon className="size-6" />
                </span>
                <span>
                  <span className="block text-lg font-bold">{s.title}</span>
                  <span className="text-muted-foreground">{s.text}</span>
                </span>
              </motion.li>
            ))}
          </ol>
        </Card>
      </motion.aside>
    </div>
  );
}
