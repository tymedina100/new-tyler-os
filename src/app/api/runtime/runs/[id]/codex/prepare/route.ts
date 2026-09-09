import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { authenticateRuntime, isAuthed, machineError } from "@/server/runtime/runtime-http";
import { prepareSubscriptionBriefing } from "@/server/runtime/subscription-service";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const auth = await authenticateRuntime(db, request);
  if (!isAuthed(auth)) return auth;
  if (auth.role !== "miles")
    return NextResponse.json({ error: "Miles role required." }, { status: 403 });
  try {
    const { id } = await context.params;
    return NextResponse.json(await prepareSubscriptionBriefing(db, id, auth.runtime.id));
  } catch (error) {
    return machineError(error);
  }
}
