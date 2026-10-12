"use client";

import * as React from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { EASE } from "@/lib/motion";

// Counts from the previous value to the new one; `format` turns the number into text
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-US"), duration = 0.9 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const from = React.useRef(0);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  // Kept in a ref: an inline format function must not restart the animation on every render
  const fmt = React.useRef(format);
  fmt.current = format;

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (reduce) {
      el.textContent = fmt.current(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration, ease: EASE,
      onUpdate: (n) => { el.textContent = fmt.current(n); },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, inView, reduce, duration]);

  return <span ref={ref} className="tabular-nums">{format(0)}</span>;
}
