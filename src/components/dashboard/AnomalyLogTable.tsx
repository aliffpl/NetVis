/**
 * AnomalyLogTable — Real-time event log with severity filter and
 * acknowledge / inspect actions.
 */

"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCheck,
  Info,
  ShieldAlert,
  Trash2,
  Ban,
  ArrowDownToLine,
  ArrowUpToLine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AnomalyEvent, AnomalyKind, AnomalySeverity } from "@/types";
import { useNetworkStore } from "@/store/useNetworkStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const SEVERITY_VISUAL: Record<AnomalySeverity, { color: string; bg: string; Icon: LucideIcon }> = {
  info: { color: "text-sky-300", bg: "bg-sky-500/10", Icon: Info },
  warning: { color: "text-amber-300", bg: "bg-amber-500/10", Icon: AlertTriangle },
  critical: { color: "text-rose-300", bg: "bg-rose-500/10", Icon: ShieldAlert },
};

const KIND_LABEL: Record<AnomalyKind, string> = {
  "high-latency": "Latency Spike",
  "packet-loss": "Packet Loss",
  "node-down": "Node Down",
  "dns-degradation": "DNS Degradation",
  "middlebox-overhead": "Middlebox Overhead",
  "route-flap": "Route Flap",
  "bandwidth-saturation": "Bandwidth Saturation",
  "negative-cycle": "Negative Cycle",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

type SeverityFilter = "all" | AnomalySeverity;

export function AnomalyLogTable() {
  const anomalies = useNetworkStore((s) => s.anomalies);
  const acknowledgeAnomaly = useNetworkStore((s) => s.acknowledgeAnomaly);
  const clearAnomalies = useNetworkStore((s) => s.clearAnomalies);
  const setSelected = useNetworkStore((s) => s.setSelected);
  const [filter, setFilter] = useState<SeverityFilter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return anomalies;
    return anomalies.filter((a) => a.severity === filter);
  }, [anomalies, filter]);

  const counts = useMemo(() => {
    const out = { info: 0, warning: 0, critical: 0 };
    for (const a of anomalies) out[a.severity]++;
    return out;
  }, [anomalies]);

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Anomaly Log
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {anomalies.length}
          </span>
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[10px] text-muted-foreground hover:text-rose-300"
          onClick={clearAnomalies}
          title="Clear all anomalies"
        >
          <Trash2 className="h-3 w-3" /> Clear
        </Button>
      </CardHeader>

      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 pb-2">
        <FilterPill label="All" count={anomalies.length} active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterPill label="Critical" count={counts.critical} color="text-rose-300" active={filter === "critical"} onClick={() => setFilter("critical")} />
        <FilterPill label="Warning" count={counts.warning} color="text-amber-300" active={filter === "warning"} onClick={() => setFilter("warning")} />
        <FilterPill label="Info" count={counts.info} color="text-sky-300" active={filter === "info"} onClick={() => setFilter("info")} />
      </div>

      <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full w-full custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-[11px] text-muted-foreground">
              <CheckCheck className="h-6 w-6 text-emerald-400/70" />
              No anomalies in view. Network is healthy.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((a) => (
                <AnomalyRow
                  key={a.id}
                  anomaly={a}
                  onAck={() => acknowledgeAnomaly(a.id)}
                  onInspectNode={(id) => setSelected({ kind: "node", id })}
                  onInspectEdge={(id) => setSelected({ kind: "edge", id })}
                />
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function FilterPill({ label, count, active, onClick, color }: { label: string; count: number; active: boolean; onClick: () => void; color?: string; }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-transparent text-muted-foreground hover:bg-muted/50",
      )}
    >
      <span className={cn(!active && color)}>{label}</span>
      <span className="font-mono text-[9px] opacity-80">{count}</span>
    </button>
  );
}

function AnomalyRow({ anomaly, onAck, onInspectNode, onInspectEdge }: { anomaly: AnomalyEvent; onAck: () => void; onInspectNode: (id: string) => void; onInspectEdge: (id: string) => void; }) {
  const sev = SEVERITY_VISUAL[anomaly.severity];
  const { Icon } = sev;

  return (
    <li className="flex gap-2 p-2.5 transition-colors hover:bg-muted/30">
      <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", sev.bg, sev.color)}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-[11px] font-medium text-foreground">{anomaly.title}</span>
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{formatTime(anomaly.ts)}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{anomaly.description}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Badge variant="outline" className={cn("h-4 border-border px-1.5 text-[9px]", sev.color)}>
            {KIND_LABEL[anomaly.kind]}
          </Badge>
          {anomaly.observedValue !== undefined && anomaly.expectedValue !== undefined && (
            <span className="font-mono text-[9px] text-muted-foreground">
              {anomaly.observedValue.toFixed(1)} / {anomaly.expectedValue.toFixed(1)}
            </span>
          )}
          {anomaly.nodeIds?.map((id) => (
            <button key={`n-${id}`} onClick={() => onInspectNode(id)} className="flex items-center gap-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 px-1 py-0.5 font-mono text-[9px] text-cyan-200 hover:bg-cyan-500/20">
              <ArrowDownToLine className="h-2.5 w-2.5" /> {id}
            </button>
          ))}
          {anomaly.edgeIds?.map((id) => (
            <button key={`e-${id}`} onClick={() => onInspectEdge(id)} className="flex items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 font-mono text-[9px] text-amber-200 hover:bg-amber-500/20">
              <ArrowUpToLine className="h-2.5 w-2.5" /> {id}
            </button>
          ))}
          {anomaly.acknowledged ? (
            <span className="ml-auto flex items-center gap-0.5 text-[9px] text-emerald-400">
              <CheckCheck className="h-2.5 w-2.5" /> acked
            </span>
          ) : (
            <button onClick={onAck} className="ml-auto flex items-center gap-0.5 rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground">
              <Ban className="h-2.5 w-2.5" /> Ack
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
