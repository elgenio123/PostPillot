import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UserError } from "./runs";

// Wraps a route handler so user mistakes become 400 answers with a readable message
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: 400 });
      if (err instanceof ZodError) return NextResponse.json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
      console.error(err);
      return NextResponse.json({ error: (err as Error).message ?? "Unexpected error" }, { status: 500 });
    }
  };
}

export type Ctx<P> = { params: Promise<P> };
