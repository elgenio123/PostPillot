import { cn } from "@/lib/utils";

// Generic platform marks (not the official brand assets)
export function PlatformIcon({ platform, className }: { platform: "facebook" | "linkedin"; className?: string }) {
  const facebook = platform === "facebook";
  return (
    <span
      className={cn("inline-grid size-8 place-items-center rounded-xl font-extrabold text-white", facebook ? "bg-[#1877F2]" : "bg-[#0A66C2]", className)}
      aria-label={facebook ? "Facebook" : "LinkedIn"}
    >
      <span className="text-[0.95em] leading-none">{facebook ? "f" : "in"}</span>
    </span>
  );
}
