import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateRuntime, isAuthed, machineError } from "@/server/runtime/runtime-http";
import { claimNextJob, markRuntimeSeen } from "@/server/runtime/runtime-service";

/**
 * Claim the next queued job for this role + runtime instance.
 *
 * GET with a side effect, on purpose: a poller should not need a second
 * round trip to take work. Empty queue is `{ job: null }`, not 204, so a
 * client can parse JSON on every response. Identity comes from the credential.
 */

export async function GET(request: Request) {
  const db = getDb();
  const auth = await authenticateRuntime(db, request);
  if (!isAuthed(auth)) return auth;

  try {
    await markRuntimeSeen(db, auth.runtime);
    const claimed = await claimNextJob(db, { runtimeId: auth.runtime.id, role: auth.role });
    if (claimed === null) return NextResponse.json({ job: null, run: null });
    return NextResponse.json(claimed);
  } catch (error) {
    return machineError(error);
  }
}
