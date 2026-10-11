"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, LogOut, ShieldAlert, UserRound } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/fields";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/controls";
import { api } from "@/lib/utils";

function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, setUser } = useApp();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) { setCurrent(""); setNext(""); setConfirm(""); setError(""); }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setError("The two new passwords are different");
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/password", { method: "POST", json: { current, next } });
      if (user) setUser({ ...user, mustChangePassword: false });
      toast.success("Password changed. Other devices were signed out.");
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>At least 10 characters. Other signed-in devices will be signed out.</DialogDescription>
        <form onSubmit={submit} className="mt-5 grid gap-4">
          <div><Label htmlFor="pw-current">Current password</Label><Input id="pw-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div><Label htmlFor="pw-new">New password</Label><Input id="pw-new" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} /></div>
          <div><Label htmlFor="pw-confirm">Repeat new password</Label><Input id="pw-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          {error && <p role="alert" className="rounded-2xl bg-danger-soft p-3 font-semibold text-danger">{error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>Save password</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AccountMenu() {
  const { user } = useApp();
  const router = useRouter();
  const [pwOpen, setPwOpen] = React.useState(false);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  };

  if (!user) return null;
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button className="relative grid size-10 place-items-center rounded-full bg-primary-soft font-bold text-primary hover:ring-2 hover:ring-primary/30" aria-label="Account">
            {user.name.slice(0, 1).toUpperCase() || <UserRound className="size-5" />}
            {user.mustChangePassword && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-accent ring-2 ring-background" />}
          </button>
        </MenuTrigger>
        <MenuContent align="end">
          <div className="px-3 py-2">
            <p className="font-bold">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <MenuItem onSelect={() => setPwOpen(true)}><KeyRound className="mt-0.5 size-5 text-primary" /> Change password</MenuItem>
          <MenuItem onSelect={logout}><LogOut className="mt-0.5 size-5 text-danger" /> Sign out</MenuItem>
        </MenuContent>
      </Menu>
      <PasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );
}

// Shown until the default password from .env has been replaced
export function DefaultPasswordBanner() {
  const { user } = useApp();
  const [open, setOpen] = React.useState(false);
  if (!user?.mustChangePassword) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3">
      <ShieldAlert className="size-5 text-accent" />
      <p className="flex-1 font-semibold">You are still using the default password. Change it before sharing this server.</p>
      <Button size="sm" variant="accent" onClick={() => setOpen(true)}>Change password</Button>
      <PasswordDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
