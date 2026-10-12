"use client";

import { motion } from "motion/react";
import { EASE } from "@/lib/motion";

// Re-mounted on every navigation: gives each page the same soft entrance
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
      {children}
    </motion.div>
  );
}
