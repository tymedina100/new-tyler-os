import { NextResponse } from "next/server";
import { heartbeatSchema } from "@/domain/runtime/runtime-schema";
import { getDb } from "@/server/db/client";
import { authenticateRuntime, isAuthed, machineError } from "@/server/runtime/runtime-http";
import { heartbeatRun } from "@/server/runtime/runtime-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRuntime(request);
  if (!isAuthed(auth)) return auth;

  try {
    const { id } = await context.params;
    const body = await readJson(request);
    heartbeatSchema.parse(body ?? {});
    await heartbeatRun(getDb(), id, auth.runtimeKind);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return machineError(error);
  }
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim().length === 0) return {};
  return JSON.parse(text) as unknown;
}
