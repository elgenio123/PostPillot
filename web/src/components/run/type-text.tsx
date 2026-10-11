"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

// Texts already typed once are shown instantly after a refresh
const seen = new Set<string>();

export function TypeText({ id, text, className, duration = 1400 }: { id: string; text: string; className?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const key = `${id}:${text.length}`;
  const [count, setCount] = React.useState(() => (reduce || seen.has(key) ? text.length : 0));

  React.useEffect(() => {
    if (reduce || seen.has(key)) {
      setCount(text.length);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const n = Math.min(text.length, Math.ceil(((t - start) / duration) * text.length));
      setCount(n);
      if (n < text.length) frame = requestAnimationFrame(tick);
      else seen.add(key);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key, text, duration, reduce]);

  return (
    <span className={className}>
      {text.slice(0, count)}
      {count < text.length && <span className="ml-0.5 inline-block h-[1.1em] w-[3px] translate-y-[3px] animate-pulse rounded bg-primary" aria-hidden />}
    </span>
  );
}
