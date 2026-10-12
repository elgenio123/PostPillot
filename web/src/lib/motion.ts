// Shared motion settings, so every screen moves the same way
import type { Transition, Variants } from "motion/react";

export const EASE = [0.22, 1, 0.36, 1] as const;

export const spring: Transition = { type: "spring", bounce: 0.25, duration: 0.5 };

// Parent: <motion.div variants={stagger()} initial="hidden" animate="show">, children: variants={fadeUp}
export const stagger = (gap = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: spring },
};

// Lift for clickable cards and rows
export const hoverLift = { whileHover: { y: -3 }, whileTap: { scale: 0.985 }, transition: { duration: 0.2, ease: EASE } };
