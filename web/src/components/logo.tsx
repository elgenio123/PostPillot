import { cn } from "@/lib/utils";

// Paper plane taking off: the agent flies, the human pilots
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-[#3730A3] to-[#0284C7] text-white shadow-lift", className)}>
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 3 10 14" />
        <path d="M21 3 14.5 21l-4.5-7-7-4.5Z" fill="currentColor" fillOpacity={0.25} />
        <circle cx="19" cy="19" r="2.2" fill="#F97316" stroke="none" />
      </svg>
    </span>
  );
}
