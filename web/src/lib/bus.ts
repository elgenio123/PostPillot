import { EventEmitter } from "node:events";

export type BusEvent =
  | { type: "event"; runId: string; step: string; status: string; message?: string }
  | { type: "run"; runId: string }
  | { type: "decision"; runId: string; draftId: string; platform: string; decision: string; source: string }
  | { type: "post"; runId: string; postId: string; platform: string; status: string }
  | { type: "report"; reportId: string }
  | { type: "cost"; runId?: string };

const g = globalThis as unknown as { __ppBus?: EventEmitter };

// Shared across route bundles so the SSE stream sees events from every route
export function bus(): EventEmitter {
  if (!g.__ppBus) {
    g.__ppBus = new EventEmitter();
    g.__ppBus.setMaxListeners(100);
  }
  return g.__ppBus;
}

export function publish(evt: BusEvent) {
  bus().emit("evt", evt);
}
