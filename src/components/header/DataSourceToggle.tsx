/**
 * DataSourceToggle — pill-shaped segmented toggle that flips the global
 * telemetry source between "Demo" (deterministic TelemetrySimulator) and
 * "Live API" (REST-backed ApiTelemetryService).
 *
 * Reads `dataSource` and `setDataSource` from the Zustand store; no local
 * state is permitted for simulation-impacting data.
 */

"use client";

import { Database, MonitorPlay } from "lucide-react";
import { useNetworkStore } from "@/store/useNetworkStore";
import { cn } from "@/lib/utils";
import type { TelemetryDataSource } from "@/services/telemetry/types";

const OPTIONS: ReadonlyArray<{ value: TelemetryDataSource; label: string; icon: typeof Database }> = [
  { value: "demo", label: "Demo", icon: MonitorPlay },
  { value: "api", label: "Live API", icon: Database },
];

export function DataSourceToggle() {
  const dataSource = useNetworkStore((s) => s.dataSource);
  const setDataSource = useNetworkStore((s) => s.setDataSource);

  return (
    <div
      role="radiogroup"
      aria-label="Telemetry data source"
      className="flex h-7 items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5 backdrop-blur-sm"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = dataSource === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => setDataSource(value)}
            title={`Switch to ${label} telemetry`}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium uppercase tracking-wider transition-all",
              active
                ? value === "demo"
                  ? "bg-cyan-500/20 text-cyan-300 shadow-[0_0_12px_oklch(0.75_0.18_195/0.35)]"
                  : "bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_oklch(0.72_0.17_162/0.35)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3 w-3" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
