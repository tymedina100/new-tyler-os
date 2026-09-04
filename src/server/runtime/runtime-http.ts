import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { claimIdentitySchema, type ClaimIdentity } from "@/domain/runtime/runtime-schema";
import { isDomainError } from "@/domain/shared/errors";
import { presentedTokenMatches, runtimeTokenConfig } from "@/server/runtime/runtime-token";

/**
 * Shared machine-API request handling.
 *
 * Every `/api/runtime` route goes through this so a missing bearer check
 * cannot hide in one handler. Identity is a role plus a runtime kind —
 * never a collapsed "miles_python" worker type.
 */

const BEARER_PREFIX = "Bearer ";

export type AuthedRuntimeRequest = ClaimIdentity;

export function unauthorized(message: string, status = 401): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function authenticateMachine(request: Request): true | NextResponse {
  const config = runtimeTokenConfig();
  if (config.mode === "off") {
    return unauthorized(config.reason, 503);
  }

  const presented = bearerToken(request);
  if (presented === null || !presentedTokenMatches(config.token, presented)) {
    return unauthorized("Invalid runtime token.");
  }

  return true;
}

export function authenticateRuntime(request: Request): AuthedRuntimeRequest | NextResponse {
  const machine = authenticateMachine(request);
  if (machine !== true) return machine;

  const identity = claimIdentitySchema.safeParse(readIdentity(request));
  if (!identity.success) {
    return NextResponse.json(
      {
        error:
          "Send X-TylerOS-Runtime-Kind and X-TylerOS-Role (or runtimeKind and role query parameters).",
      },
      { status: 400 },
    );
  }

  return identity.data;
}

export function isAuthed(
  result: AuthedRuntimeRequest | NextResponse,
): result is AuthedRuntimeRequest {
  return !(result instanceof NextResponse);
}

export function machineError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  if (isDomainError(error)) {
    const status = error.code === "not_found" ? 404 : 409;
    return NextResponse.json({ error: error.message }, { status });
  }

  console.error("[tyleros] machine API failed", error);
  return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null || !header.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length === 0 ? null : token;
}

function readIdentity(request: Request): { runtimeKind: unknown; role: unknown } {
  const url = new URL(request.url);
  return {
    runtimeKind:
      request.headers.get("x-tyleros-runtime-kind") ?? url.searchParams.get("runtimeKind"),
    role: request.headers.get("x-tyleros-role") ?? url.searchParams.get("role"),
  };
}
