"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Lock, LogIn, Mail } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/fields";
import { api } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", json: { email, password } });
      // Only same-site paths, so the login page cannot be abused to redirect elsewhere
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div>
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="pl-12" placeholder="you@school.cm" autoFocus />
        </div>
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pl-12" />
        </div>
      </div>
      {error && <p role="alert" className="rounded-2xl bg-danger-soft p-3 font-semibold text-danger">{error}</p>}
      <Button type="submit" variant="accent" size="lg" loading={busy} className="w-full">
        {!busy && <LogIn />} Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-16 rounded-3xl [&_svg]:size-9" />
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Welcome to PostPilot</h1>
          <p className="mt-1 text-muted-foreground">AI drafts. You decide. Sign in to continue.</p>
        </div>
        <Card className="p-7">
          <Suspense>
            <LoginForm />
          </Suspense>
        </Card>
      </motion.div>
    </div>
  );
}
