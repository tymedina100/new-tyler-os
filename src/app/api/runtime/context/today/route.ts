import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateRuntime, isAuthed, machineError } from "@/server/runtime/runtime-http";
import { getTodayContext, markRuntimeSeen } from "@/server/runtime/runtime-service";

/**
 * Observe Today's open work and food that is expiring soon.
 *
 * Titles and dates only. Completing a briefing still cannot create a note;
 * that waits on approval.
 */

export async function GET(request: Request) {
  const db = getDb();
  const auth = await authenticateRuntime(db, request);
  if (!isAuthed(auth)) return auth;

  try {
    await markRuntimeSeen(db, auth.runtime);
    const context = await getTodayContext(db);
    return NextResponse.json(context);
  } catch (error) {
    return machineError(error);
  }
}
