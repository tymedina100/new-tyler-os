import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateMachine, machineError } from "@/server/runtime/runtime-http";
import { tickSchedules } from "@/server/runtime/schedule-service";

/**
 * System clock-in for schedules.
 *
 * Not a role. The bearer token is the same machine credential; Miles is not
 * in the path. Recovers stale observe runs and enqueues due jobs. No model.
 */

export async function POST(request: Request) {
  const auth = authenticateMachine(request);
  if (auth !== true) return auth;

  try {
    const result = await tickSchedules(getDb());
    return NextResponse.json(result);
  } catch (error) {
    return machineError(error);
  }
}
