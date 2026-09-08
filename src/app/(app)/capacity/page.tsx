import type { Metadata } from "next";
import { CapacityRemainingForm } from "@/components/runtime/capacity-remaining-form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import {
  CAPACITY_CONFIDENCE_LABELS,
  CAPACITY_UNIT_LABELS,
  formatEstimatedCostUsd,
} from "@/domain/runtime/capacity";
import { RUNTIME_CAPABILITY_LABELS, RUNTIME_HEALTH_LABELS } from "@/domain/runtime/fleet";
import { RUNTIME_KIND_LABELS } from "@/domain/runtime/runtime";
import { getDb } from "@/server/db/client";
import { listFleetBoard } from "@/server/runtime/capacity-service";

export const metadata: Metadata = { title: "Capacity" };

/**
 * Operational read of execution instances and quota pools.
 *
 * Not a game world and not a router. Health is derived from last seen.
 * Quota pools stay empty until real remaining is recorded.
 */
export default async function CapacityPage() {
  const board = await listFleetBoard(getDb());

  return (
    <>
      <PageHeader
        title="Capacity"
        description="Runtime instances, quota pools, and recent usage. Routing is not in this slice."
      />

      <section className="mb-8 grid gap-3">
        <h2 className="text-sm font-semibold">Runtimes</h2>
        {board.runtimes.length === 0 ? (
          <EmptyState
            title="No runtime instances"
            description="Bootstrap a worker with pnpm runtime:bootstrap -- --role miles. Miles is a role; a Python process is an instance under it."
          />
        ) : (
          <ul className="grid gap-2">
            {board.runtimes.map((row) => (
              <li key={row.runtime.id} className="border-border bg-card rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{row.runtime.name}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {row.runtime.instanceKey} · {RUNTIME_KIND_LABELS[row.runtime.kind]}
                      {row.runtime.deviceId ? ` · ${row.runtime.deviceId}` : ""}
                    </p>
                  </div>
                  <span className="text-xs font-medium">{RUNTIME_HEALTH_LABELS[row.health]}</span>
                </div>
                <p className="text-muted-foreground mt-2 text-sm">{row.lastSeenLabel}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {row.capabilities.map((cap) => RUNTIME_CAPABILITY_LABELS[cap]).join(" · ") ||
                    "No capabilities recorded"}
                  {row.roles.length > 0 ? ` · roles: ${row.roles.join(", ")}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8 grid gap-3">
        <h2 className="text-sm font-semibold">Quota pools</h2>
        <p className="text-muted-foreground text-xs">
          {`Last 7 days estimated spend $${board.spendWindowUsd.toFixed(2)}. Today (America/Phoenix) $${board.spendTodayUsd.toFixed(2)}. Forecasts are estimated.`}
        </p>
        {board.pools.length === 0 ? (
          <EmptyState
            title="No pools"
            description="Quota pools stay empty until you record them. Migrations do not invent subscription limits. Local mock data is pnpm capacity:seed-examples only."
          />
        ) : (
          <ul className="grid gap-2">
            {board.pools.map(({ pool, forecast }) => (
              <li key={pool.id} className="border-border bg-card rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{pool.displayName}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {pool.provider} · {pool.product} · {pool.poolKey}
                    </p>
                  </div>
                  <span className="text-xs font-medium">
                    {pool.remaining === null
                      ? "Unknown remaining"
                      : `${pool.remaining} ${CAPACITY_UNIT_LABELS[pool.remainingUnit]}`}
                  </span>
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  {CAPACITY_CONFIDENCE_LABELS[pool.estimateConfidence]}
                  {pool.resetType !== "none" && pool.resetType !== "unknown"
                    ? ` · reset ${pool.resetType}`
                    : ""}
                  {pool.resetAt
                    ? ` · ${pool.resetAt.toLocaleString("en-US", {
                        timeZone: pool.resetTimezone ?? "UTC",
                      })} ${pool.resetTimezone ?? "UTC"}`
                    : ""}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">{forecast.summary}</p>
                {pool.sourceNote ? (
                  <p className="text-muted-foreground mt-1 text-xs">{pool.sourceNote}</p>
                ) : null}
                <CapacityRemainingForm pool={pool} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">Recent usage</h2>
        {board.recentUsage.length === 0 ? (
          <p className="text-muted-foreground text-sm">No usage recorded yet.</p>
        ) : (
          <ul className="grid gap-2">
            {board.recentUsage.map((entry) => (
              <li key={entry.id} className="text-muted-foreground text-xs">
                {entry.recordedAt.toISOString().replace("T", " ").slice(0, 19)} ·{" "}
                {entry.provider ?? "none"} / {entry.model ?? "—"} ·{" "}
                {formatEstimatedCostUsd(entry.estimatedCostUsd)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
