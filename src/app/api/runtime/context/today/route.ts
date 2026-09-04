import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateRuntime, isAuthed, machineError } from "@/server/runtime/runtime-http";
import { getTodayContext } from "@/server/runtime/runtime-service";

/**
 * Observe Today's open work and food that is expiring soon.
 *
 * Titles and dates only. Completing a briefing still cannot create a note;
 * that waits on approval.
 */

export async function GET(request: Request) {
  const auth = authenticateRuntime(request);
  if (!isAuthed(auth)) return auth;

  try {
    const context = await getTodayContext(getDb());
    return NextResponse.json(context);
  } catch (error) {
    return machineError(error);
  }
}
