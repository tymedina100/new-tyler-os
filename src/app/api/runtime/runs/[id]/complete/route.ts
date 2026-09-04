import { NextResponse } from "next/server";
import { completeRunSchema } from "@/domain/runtime/runtime-schema";
import { getDb } from "@/server/db/client";
import { authenticateRuntime, isAuthed, machineError } from "@/server/runtime/runtime-http";
import { completeRun } from "@/server/runtime/runtime-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRuntime(request);
  if (!isAuthed(auth)) return auth;

  try {
    const { id } = await context.params;
    const input = completeRunSchema.parse(await request.json());
    await completeRun(getDb(), id, auth.runtimeKind, input);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return machineError(error);
  }
}
