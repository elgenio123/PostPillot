import confetti from "canvas-confetti";

const COLORS = ["#3730A3", "#6366F1", "#0EA5E9", "#F97316", "#FDBA74"];

// Light confetti burst from an element (or the centre); skipped for reduced motion
export function celebrate(from?: HTMLElement | null, big = false) {
  const r = from?.getBoundingClientRect();
  const origin = r
    ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight }
    : { x: 0.5, y: 0.6 };
  confetti({ particleCount: big ? 160 : 70, spread: big ? 100 : 65, startVelocity: big ? 45 : 32, origin, colors: COLORS, disableForReducedMotion: true, scalar: 1.1 });
}
