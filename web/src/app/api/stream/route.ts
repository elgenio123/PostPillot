import { bus, type BusEvent } from "@/lib/bus";

export const dynamic = "force-dynamic";

// Server-Sent Events: pushes every app event to the browser as it happens
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (evt: BusEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      const ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15000);
      bus().on("evt", send);
      controller.enqueue(encoder.encode(": connected\n\n"));
      cleanup = () => {
        clearInterval(ping);
        bus().off("evt", send);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
