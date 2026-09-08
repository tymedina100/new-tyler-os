import { NextResponse } from "next/server";
import { completeRunSchema } from "@/domain/runtime/runtime-schema";
import { getDb } from "@/server/db/client";
import { authenticateRuntime, isAuthed, machineError } from "@/server/runtime/runtime-http";
import { completeRun } from "@/server/runtime/runtime-service";

/**
 * Worker completion. Empty-Today and failures are legitimate here.
 * A `today_briefing_ai` proposal is not: that requires validated Miles
 * judgment on the `/brief` path, not a worker-supplied note.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const auth = await authenticateRuntime(db, request);
  if (!isAuthed(auth)) return auth;

  try {
    const { id } = await context.params;
    const input = completeRunSchema.parse(await request.json());
    await completeRun(db, id, auth.runtime.id, input);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return machineError(error);
  }
}
