import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { briefAiRun } from "@/server/runtime/briefing-service";
import { authenticateRuntime, isAuthed, machineError } from "@/server/runtime/runtime-http";

/**
 * Claimed AI briefing: TylerOS calls the official provider once, validates
 * structured output, and completes the run. The worker does not hold the key.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const auth = await authenticateRuntime(db, request);
  if (!isAuthed(auth)) return auth;

  try {
    const { id } = await context.params;
    const result = await briefAiRun(db, id, auth.runtime.id);
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    return machineError(error);
  }
}
