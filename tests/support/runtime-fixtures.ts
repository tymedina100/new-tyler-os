import { bootstrapRuntime } from "@/server/runtime/fleet-service";
import type { Database } from "@/server/db/client";
import type { Runtime, RuntimeKind } from "@/domain/runtime/runtime";

export async function registerMilesRuntime(
  db: Database,
  instanceKey: string,
  kind: RuntimeKind = "python",
  status: Runtime["status"] = "enabled",
): Promise<Runtime> {
  const { runtime } = await bootstrapRuntime(db, {
    instanceKey,
    name: instanceKey,
    kind,
    roles: ["miles"],
    capabilities: ["deterministic"],
    status,
  });
  return runtime;
}
