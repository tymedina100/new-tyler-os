import { z, ZodError } from "zod";
import { DomainError } from "@/domain/shared/errors";
import {
  mobileApprovalSchema,
  mobileCaptureSchema,
  mobileEditSchema,
  mobileRequestSchema,
  mobileSessionSchema,
} from "@/domain/mobile/mobile-schema";
import type { AuthConfig } from "@/server/auth/auth-config";
import type { Database } from "@/server/db/client";
import { getTodayData, listItemsForView } from "@/server/items/item-service";
import { getOperationsSummary } from "@/server/runtime/operations-service";
import { findNotes, listNotes } from "@/server/notes/note-service";
import { enqueueTodayBriefing, listRuntimeBoard } from "@/server/runtime/runtime-service";
import { readWorkBoard } from "@/server/knowledge/work-board-service";
import { readKnowledge } from "@/server/knowledge/knowledge-service";
import { searchEverything } from "@/server/search/search-service";
import { createMobileSession, MobileHttpError, requireMobileSession } from "./mobile-auth";
import { revokeSession } from "./mobile-repository";
import {
  captureMobile,
  decideMobileApproval,
  editMobileItem,
  mobileMutation,
} from "./mobile-service";

const MAX_BODY_BYTES = 48_000;
const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
export function mobileErrorResponse(error: unknown): Response {
  if (error instanceof MobileHttpError)
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers },
    );
  if (error instanceof ZodError)
    return Response.json(
      { error: { code: "invalid_input", message: error.issues[0]?.message ?? "Invalid request." } },
      { status: 400, headers },
    );
  if (error instanceof DomainError)
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.code === "not_found" ? 404 : 409, headers },
    );
  console.error(
    "[tyleros] mobile request failed",
    error instanceof Error ? error.name : "Unknown error",
  );
  return Response.json(
    { error: { code: "unavailable", message: "TylerOS is temporarily unavailable." } },
    { status: 503, headers },
  );
}

/** Bounded streamed read, even when content-length is absent or forged. */
async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new MobileHttpError(415, "invalid_input", "Send application/json.");
  const reader = request.body?.getReader();
  if (!reader) throw new MobileHttpError(400, "invalid_input", "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new MobileHttpError(413, "too_large", "Request is too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new MobileHttpError(400, "invalid_input", "Invalid JSON.");
  }
}

export async function handleMobileRequest(
  db: Database,
  config: AuthConfig,
  request: Request,
  path: string[],
): Promise<Response> {
  try {
    if (config.mode !== "guarded")
      throw new MobileHttpError(503, "unavailable", "Mobile access is not configured.");
    const route = path.join("/");
    const method = request.method;
    if (route === "session" && method === "POST") {
      const input = mobileSessionSchema.parse(await readBody(request));
      return Response.json(
        { data: await createMobileSession(db, config, input.passphrase) },
        { headers },
      );
    }
    const sessionHash = await requireMobileSession(
      db,
      config,
      request.headers.get("authorization"),
    );
    let data: unknown;
    if (route === "session" && method === "DELETE") {
      await revokeSession(db, sessionHash);
      data = { revoked: true };
    } else if (route === "today" && method === "GET") {
      const now = new Date();
      const [today, operations] = await Promise.all([
        getTodayData(db, now),
        getOperationsSummary(db, now),
      ]);
      data = { ...today, operations };
    } else if (route === "items" && method === "GET") {
      data = { items: await listItemsForView(db, {}) };
    } else if (route === "notes" && method === "GET") {
      const query = z
        .string()
        .max(200)
        .parse(new URL(request.url).searchParams.get("q") ?? "");
      data = { notes: query.trim() ? await findNotes(db, query) : await listNotes(db) };
    } else if (route === "search" && method === "GET") {
      const query = z
        .string()
        .max(200)
        .parse(new URL(request.url).searchParams.get("q") ?? "");
      data = await searchEverything(db, query);
    } else if (route === "knowledge" && method === "GET") {
      const query = z
        .string()
        .max(200)
        .parse(new URL(request.url).searchParams.get("q") ?? "");
      data = await readKnowledge(query);
    } else if (route === "work-board" && method === "GET") {
      data = await readWorkBoard();
    } else if (route === "jobs" && method === "GET") {
      data = { jobs: await listRuntimeBoard(db) };
    } else if (route === "capture" && method === "POST") {
      const input = mobileCaptureSchema.parse(await readBody(request));
      data = await mobileMutation(db, input.requestId, [route, input.text], (tx) =>
        captureMobile(tx, input.text),
      );
    } else if (route === "requests" && method === "POST") {
      const input = mobileRequestSchema.parse(await readBody(request));
      data = await mobileMutation(db, input.requestId, [route, input.kind], (tx) =>
        enqueueTodayBriefing(tx),
      );
    } else if (path.length === 2 && path[0] === "items" && method === "PATCH") {
      const id = z.uuid().parse(path[1]);
      const input = mobileEditSchema.parse(await readBody(request));
      data = await mobileMutation(db, input.requestId, [route, input], (tx) =>
        editMobileItem(tx, id, input),
      );
    } else if (path.length === 2 && path[0] === "approvals" && method === "POST") {
      const id = z.uuid().parse(path[1]);
      const input = mobileApprovalSchema.parse(await readBody(request));
      data = await mobileMutation(db, input.requestId, [route, input.decision], (tx) =>
        decideMobileApproval(tx, id, input.decision),
      );
    } else {
      throw new MobileHttpError(404, "not_found", "Mobile endpoint not found.");
    }
    return Response.json({ data }, { headers });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
