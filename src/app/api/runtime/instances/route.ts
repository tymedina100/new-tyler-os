import { NextResponse } from "next/server";
import { bootstrapRuntimeSchema } from "@/domain/runtime/fleet-schema";
import { getDb } from "@/server/db/client";
import { authenticateMachine, machineError } from "@/server/runtime/runtime-http";
import { bootstrapRuntime } from "@/server/runtime/fleet-service";

/**
 * Create a runtime instance and return its credential once.
 *
 * System RUNTIME_TOKEN only. The plaintext token is not stored. Do not log it.
 */

export async function POST(request: Request) {
  const auth = authenticateMachine(request);
  if (auth !== true) return auth;

  try {
    const input = bootstrapRuntimeSchema.parse(await request.json());
    const { runtime, token } = await bootstrapRuntime(getDb(), input);
    return NextResponse.json({
      id: runtime.id,
      instanceKey: runtime.instanceKey,
      name: runtime.name,
      kind: runtime.kind,
      token,
    });
  } catch (error) {
    return machineError(error);
  }
}
