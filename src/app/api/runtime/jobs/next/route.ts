import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateRuntime, isAuthed, machineError } from "@/server/runtime/runtime-http";
import { claimNextJob } from "@/server/runtime/runtime-service";

/**
 * Claim the next queued job for this role + runtime.
 *
 * GET with a side effect, on purpose: a poller should not need a second
 * round trip to take work. Empty queue is `{ job: null }`, not 204, so a
 * client can parse JSON on every response.
 */

export async function GET(request: Request) {
  const auth = authenticateRuntime(request);
  if (!isAuthed(auth)) return auth;

  try {
    const claimed = await claimNextJob(getDb(), auth);
    if (claimed === null) return NextResponse.json({ job: null, run: null });
    return NextResponse.json(claimed);
  } catch (error) {
    return machineError(error);
  }
}
