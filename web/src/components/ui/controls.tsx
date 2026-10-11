"use client";

import * as React from "react";
import { Switch as SwitchP, Select as SelectP, Tooltip as TooltipP, Checkbox as CheckboxP, Tabs as TabsP, DropdownMenu as MenuP } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchP.Root>) {
  return (
    <SwitchP.Root
      className={cn(
        "peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-muted-foreground/30 transition-colors data-[state=checked]:bg-primary disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchP.Thumb className="pointer-events-none block size-6 rounded-full bg-white shadow-md transition-transform data-[state=checked]:translate-x-5" />
    </SwitchP.Root>
  );
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxP.Root>) {
  return (
    <CheckboxP.Root
      className={cn("grid size-6 shrink-0 place-items-center rounded-lg border-2 border-border bg-card transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground", className)}
      {...props}
    >
      <CheckboxP.Indicator>
        <Check className="size-4" strokeWidth={3} />
      </CheckboxP.Indicator>
    </CheckboxP.Root>
  );
}

export function Select({ value, onValueChange, options, className, placeholder, disabled }: {
  value: string; onValueChange: (v: string) => void; options: { value: string; label: string; hint?: string }[];
  className?: string; placeholder?: string; disabled?: boolean;
}) {
  return (
    <SelectP.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectP.Trigger
        className={cn("inline-flex h-11 items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 text-left font-medium shadow-soft hover:bg-muted disabled:opacity-60", className)}
      >
        <SelectP.Value placeholder={placeholder} />
        <SelectP.Icon><ChevronDown className="size-4 opacity-60" /></SelectP.Icon>
      </SelectP.Trigger>
      <SelectP.Portal>
        <SelectP.Content position="popper" sideOffset={6} className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-lift">
          <SelectP.Viewport>
            {options.map((o) => (
              <SelectP.Item key={o.value} value={o.value} className="relative flex cursor-pointer select-none flex-col rounded-xl py-2 pl-9 pr-3 outline-none data-[highlighted]:bg-primary-soft">
                <SelectP.ItemIndicator className="absolute left-3 top-3"><Check className="size-4 text-primary" /></SelectP.ItemIndicator>
                <SelectP.ItemText>{o.label}</SelectP.ItemText>
                {o.hint && <span className="text-sm text-muted-foreground">{o.hint}</span>}
              </SelectP.Item>
            ))}
          </SelectP.Viewport>
        </SelectP.Content>
      </SelectP.Portal>
    </SelectP.Root>
  );
}

export function Tip({ children, content, side = "bottom" }: { children: React.ReactNode; content: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipP.Root delayDuration={200}>
      <TooltipP.Trigger asChild>{children}</TooltipP.Trigger>
      <TooltipP.Portal>
        <TooltipP.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-xl bg-foreground px-3 py-2 text-sm font-medium text-background shadow-lift">
          {content}
          <TooltipP.Arrow className="fill-foreground" />
        </TooltipP.Content>
      </TooltipP.Portal>
    </TooltipP.Root>
  );
}

export const TooltipProvider = TooltipP.Provider;

export const Tabs = TabsP.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsP.List>) {
  return <TabsP.List className={cn("inline-flex items-center gap-1 rounded-2xl bg-muted p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsP.Trigger>) {
  return (
    <TabsP.Trigger
      className={cn("rounded-xl px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-soft", className)}
      {...props}
    />
  );
}

export const TabsContent = TabsP.Content;

export const Menu = MenuP.Root;
export const MenuTrigger = MenuP.Trigger;

export function MenuContent({ className, ...props }: React.ComponentProps<typeof MenuP.Content>) {
  return (
    <MenuP.Portal>
      <MenuP.Content sideOffset={8} className={cn("z-50 min-w-64 rounded-2xl border border-border bg-card p-1.5 shadow-lift", className)} {...props} />
    </MenuP.Portal>
  );
}

export function MenuItem({ className, ...props }: React.ComponentProps<typeof MenuP.Item>) {
  return <MenuP.Item className={cn("flex cursor-pointer select-none items-start gap-3 rounded-xl px-3 py-2.5 outline-none data-[highlighted]:bg-primary-soft", className)} {...props} />;
}
