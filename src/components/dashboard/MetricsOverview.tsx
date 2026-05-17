/**
 * MetricsOverview — Live KPI cards
 */

"use client";

import { useMemo } from "react";
import {
  Activity,
  Gauge,
  TrendingDown,
  TrendingUp,
  Zap,
  AlertTriangle,
  ServerCog,
  Minus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNetworkStore } from "@/store/useNetworkStore";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  deltaPct?: number;
  invertDelta?: boolean;
  accent: string;
}

function KpiCard({ icon: Icon, label, value, deltaPct, invertDelta = false, accent }: KpiCardProps) {
  const delta = deltaPct ?? 0;
  const isGood = invertDelta ? delta < 0 : delta > 0;
  const isNeutral = Math.abs(delta) < 0.5;
  const Trend = isNeutral ? Minus : delta > 0 ? TrendingUp : TrendingDown;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className={cn("mt-0.5 font-mono text-lg font-semibold leading-tight", accent)}>
              {value}
            </div>
          </div>
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60", accent)}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
          </div>
        </div>
        {deltaPct !== undefined && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px]">
            <Trend
              className={cn(
                "h-3 w-3",
                isNeutral ? "text-muted-foreground" : isGood ? "text-emerald-400" : "text-rose-400",
              )}
            />
            <span className={cn("font-mono", isNeutral ? "text-muted-foreground" : isGood ? "text-emerald-400" : "text-rose-400")}>
              {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">vs window</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MetricsOverview() {
  const metrics = useNetworkStore((s) => s.metrics);
  const anomalies = useNetworkStore((s) => s.anomalies);

  const unackAnomalies = useMemo(
    () => anomalies.filter((a) => !a.acknowledged).length,
    [anomalies],
  );

  const onlinePct =
    metrics.nodeCount > 0 ? (metrics.nodesOnline / metrics.nodeCount) * 100 : 0;

  return (
    <div className="grid grid-cols-2 gap-2">
      <KpiCard icon={Activity} label="Avg Latency" value={`${metrics.avgLatency.toFixed(1)} ms`} deltaPct={metrics.latencyDeltaPct} invertDelta accent="text-cyan-300" />
      <KpiCard icon={Gauge} label="P95 Latency" value={`${metrics.p95Latency.toFixed(1)} ms`} accent="text-sky-300" />
      <KpiCard icon={Zap} label={metrics.throughputProvenance === "derived" ? "Synthetic Throughput" : "Throughput"} value={`${(metrics.throughput / 1000).toFixed(2)} Gbps`} deltaPct={metrics.throughputProvenance === "derived" ? undefined : 0} accent="text-emerald-300" />
      <KpiCard icon={TrendingDown} label="Packet Loss" value={`${(metrics.packetLoss * 100).toFixed(3)}%`} deltaPct={metrics.lossDeltaPct} accent="text-amber-300" />
      <KpiCard icon={AlertTriangle} label="Open Anomalies" value={String(unackAnomalies)} accent="text-rose-300" />
      <KpiCard icon={ServerCog} label={metrics.telemetryScope === "public-targets" ? "Public Targets" : "Nodes Online"} value={`${metrics.nodesOnline}/${metrics.nodeCount} (${onlinePct.toFixed(0)}%)`} accent="text-fuchsia-300" />
    </div>
  );
}
