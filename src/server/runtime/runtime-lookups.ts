import { DomainError, NotFoundError } from "@/domain/shared/errors";
import type { Job, Run, Runtime } from "@/domain/runtime/runtime";
import type { Database } from "@/server/db/client";
import * as repo from "./runtime-repository";

export async function requireRun(db: Database, id: string): Promise<Run> {
  const run = await repo.findRunById(db, id);
  if (run === null) throw new NotFoundError("Run", id);
  return run;
}

export async function requireRuntime(db: Database, id: string): Promise<Runtime> {
  const runtime = await repo.findRuntimeById(db, id);
  if (runtime === null) throw new NotFoundError("Runtime", id);
  return runtime;
}

export async function requireJob(db: Database, id: string): Promise<Job> {
  const job = await repo.findJobById(db, id);
  if (job === null) throw new NotFoundError("Job", id);
  return job;
}

export function assertRunOwnedBy(run: Run, runtimeId: string): void {
  if (run.runtimeId !== runtimeId) {
    throw new DomainError("invalid_transition", "This attempt belongs to a different runtime.");
  }
}
