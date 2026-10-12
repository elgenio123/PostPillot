"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, side, ...props }: React.ComponentProps<typeof D.Content> & { side?: "right" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          "fixed z-50 border border-border bg-card shadow-lift focus:outline-none",
          side === "right"
            ? "inset-y-0 right-0 h-full w-full max-w-xl overflow-y-auto rounded-l-3xl p-5 data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in sm:p-8"
            : "left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-5 data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in sm:p-7",
          className,
        )}
        {...props}
      >
        {children}
        <D.Close className="absolute right-5 top-5 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
          <X className="size-5" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof D.Title>) {
  return <D.Title className={cn("pr-10 text-2xl font-bold tracking-tight", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof D.Description>) {
  return <D.Description className={cn("mt-1.5 text-muted-foreground", className)} {...props} />;
}
