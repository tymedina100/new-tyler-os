import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { roleClaimSchema, claimIdentitySchema } from "@/domain/runtime/runtime-schema";
import type { Role, Runtime } from "@/domain/runtime/runtime";
import { isDomainError } from "@/domain/shared/errors";
import type { Database } from "@/server/db/client";
import { findRuntimeByCredential, listGrantedRoles } from "@/server/runtime/fleet-service";
import { findRuntimeByInstanceKey } from "@/server/runtime/runtime-repository";
import { presentedTokenMatches, runtimeTokenConfig } from "@/server/runtime/runtime-token";
import { assertRoleGranted } from "@/domain/runtime/fleet-rules";

/**
 * Shared machine-API request handling.
 *
 * Instance credentials identify the runtime. Role is still requested, then
 * checked against grants. A kind header cannot impersonate another instance.
 */

const BEARER_PREFIX = "Bearer ";

export type AuthedRuntimeRequest = { runtime: Runtime; role: Role };

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

export async function authenticateRuntime(
  db: Database,
  request: Request,
  now = new Date(),
): Promise<AuthedRuntimeRequest | NextResponse> {
  const presented = bearerToken(request);
  if (presented === null) {
    const config = runtimeTokenConfig();
    if (config.mode === "off") {
      return unauthorized(config.reason, 503);
    }
    return unauthorized("Invalid runtime token.");
  }

  const instance = await findRuntimeByCredential(db, presented, now);
  if (instance) {
    const role = parseRole(request);
    if (!role) {
      return NextResponse.json(
        { error: "Send X-TylerOS-Role (or a role query parameter)." },
        { status: 400 },
      );
    }
    try {
      assertRoleGranted(await listGrantedRoles(db, instance.id), role);
    } catch (error) {
      return machineError(error);
    }
    return { runtime: instance, role };
  }

  const config = runtimeTokenConfig();
  if (config.mode !== "on" || !presentedTokenMatches(config.token, presented)) {
    return unauthorized("Invalid runtime token.");
  }

  const identity = claimIdentitySchema.safeParse(readLegacyIdentity(request));
  if (!identity.success) {
    return NextResponse.json(
      {
        error: "Legacy RUNTIME_TOKEN claims need X-TylerOS-Runtime-Kind and X-TylerOS-Role.",
      },
      { status: 400 },
    );
  }

  const runtime = await findRuntimeByInstanceKey(db, identity.data.runtimeKind);
  if (runtime === null) {
    return unauthorized("No runtime instance is registered for that kind.");
  }

  try {
    assertRoleGranted(await listGrantedRoles(db, runtime.id), identity.data.role);
  } catch (error) {
    return machineError(error);
  }

  return { runtime, role: identity.data.role };
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

function parseRole(request: Request): Role | null {
  const parsed = roleClaimSchema.safeParse({
    role: request.headers.get("x-tyleros-role") ?? new URL(request.url).searchParams.get("role"),
  });
  return parsed.success ? parsed.data.role : null;
}

function readLegacyIdentity(request: Request): { runtimeKind: unknown; role: unknown } {
  const url = new URL(request.url);
  return {
    runtimeKind:
      request.headers.get("x-tyleros-runtime-kind") ?? url.searchParams.get("runtimeKind"),
    role: request.headers.get("x-tyleros-role") ?? url.searchParams.get("role"),
  };
}
