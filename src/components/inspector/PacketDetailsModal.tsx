/**
 * PacketDetailsModal — Diagnostic detail panel that opens when a node or edge
 * is selected on the canvas.
 *
 * FIX #4: Previously rendered TWO close buttons:
 *   1. The default <DialogPrimitive.Close> injected by shadcn's
 *      <DialogContent showCloseButton> (top-right corner).
 *   2. A manual <Button onClick={() => setSelected(null)}> inside the
 *      <DialogTitle> row.
 * They visually overlapped and both fired setSelected(null). The fix
 * passes showCloseButton={false} to <DialogContent> and keeps only the
 * single explicit close button inside the title row.
 */

"use client";

import { useMemo } from "react";
import {
  Activity, Cpu, MemoryStick, Network, Router as RouterIcon, ShieldAlert, Server, Users, X,
  Gauge, TrendingDown, Layers, CircleDot, AlertCircle, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NetVisEdge, NetVisNode, AlgorithmResult } from "@/types";
import { useNetworkStore } from "@/store/useNetworkStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const NODE_TYPE_ICON: Record<string, LucideIcon> = {
  router: RouterIcon,
  middlebox: ShieldAlert,
  "edge-server": Server,
  client: Users,
};

const EDGE_STATUS_COLOR: Record<string, string> = {
  healthy: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  congested: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  degraded: "text-orange-300 border-orange-500/40 bg-orange-500/10",
  down: "text-rose-300 border-rose-500/40 bg-rose-500/10",
};

export function PacketDetailsModal() {
  const selected = useNetworkStore((s) => s.selected);
  const setSelected = useNetworkStore((s) => s.setSelected);
  const nodes = useNetworkStore((s) => s.nodes);
  const edges = useNetworkStore((s) => s.edges);
  const result = useNetworkStore((s) => s.result);

  const selectedNode = useMemo<NetVisNode | null>(
    () => (selected?.kind === "node" ? nodes.find((n) => n.id === selected.id) ?? null : null),
    [selected, nodes],
  );
  const selectedEdge = useMemo<NetVisEdge | null>(
    () => (selected?.kind === "edge" ? edges.find((e) => e.id === selected.id) ?? null : null),
    [selected, edges],
  );
  const selectedEdgeData = selectedEdge?.data;

  const isOpen = selected !== null;

  const remediations = useMemo<string[]>(() => {
    if (selectedNode) {
      const recs: string[] = [];
      if (selectedNode.data.status === "degraded") recs.push("Investigate adjacent links — likely congestion or partial outage.");
      if (selectedNode.data.cpuLoad && selectedNode.data.cpuLoad > 80) recs.push("CPU saturated — consider scaling out or rate-limiting control-plane traffic.");
      if (selectedNode.data.type === "middlebox") recs.push("Validate middlebox rule-set — DPI queue may be adding latency overhead.");
      if (selectedNode.data.packetLoss && selectedNode.data.packetLoss > 0.005) recs.push("Elevated local packet loss — inspect interface counters and CRC errors.");
      if (recs.length === 0) recs.push("No remediation required — node is within nominal operating range.");
      return recs;
    }
    if (selectedEdge) {
      const d = selectedEdge.data;
      if (!d) return [];
      const recs: string[] = [];
      if (d.utilization > 0.85) recs.push("Link saturated — consider ECMP rebalancing or capacity upgrade.");
      if (d.loss > 0.02) recs.push("Loss exceeds SLA — check optical/physical layer and MTU.");
      if (d.status === "down") recs.push("Link is down — verify BGP sessions and LSP state.");
      if (d.latency > 20) recs.push("Latency above backbone baseline — review IGP metrics.");
      if (recs.length === 0) recs.push("Link healthy — no remediation required.");
      return recs;
    }
    return [];
  }, [selectedNode, selectedEdge]);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && setSelected(null)}>
      {/* FIX #4: showCloseButton={false} removes the duplicate default
          close button that shadcn injects at the top-right corner of
          DialogContent. We render exactly one explicit close button in
          the DialogTitle row below. */}
      <DialogContent className="max-w-[520px] gap-0 p-0" showCloseButton={false}>
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            {selectedNode ? (
              <>
                <NodeTitleIcon node={selectedNode} />
                <span>{selectedNode.data.label}</span>
                <Badge variant="outline" className="ml-1 text-[10px] uppercase">{selectedNode.data.type}</Badge>
              </>
            ) : selectedEdge && selectedEdgeData ? (
              <>
                <Network className="h-4 w-4 text-cyan-300" />
                <span>{selectedEdgeData.label ?? "Link"}</span>
                <Badge variant="outline" className={cn("ml-1 border text-[10px] uppercase", EDGE_STATUS_COLOR[selectedEdgeData.status])}>
                  {selectedEdgeData.status}
                </Badge>
              </>
            ) : "Inspector"}
            {/* Single explicit close button. */}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 w-7 p-0"
              onClick={() => setSelected(null)}
              aria-label="Close inspector"
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] custom-scrollbar">
          {selectedNode && <NodeDetail node={selectedNode} result={result} />}
          {selectedEdge && <EdgeDetail edge={selectedEdge} result={result} />}

          <div className="border-t border-border px-4 py-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <AlertCircle className="h-3 w-3" /> Suggested Remediation
            </div>
            <ul className="space-y-1">
              {remediations.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-foreground/80">
                  <CircleDot className="mt-0.5 h-2.5 w-2.5 shrink-0 text-cyan-300" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function NodeTitleIcon({ node }: { node: NetVisNode }) {
  const Icon = NODE_TYPE_ICON[node.data.type] ?? RouterIcon;
  return <Icon className="h-4 w-4 text-cyan-300" />;
}

function NodeDetail({ node, result }: { node: NetVisNode; result: AlgorithmResult | null }) {
  const d = node.data;
  const distance = result?.distances[node.id];
  const predecessor = result?.predecessors[node.id];

  return (
    <div className="space-y-4 p-4 text-[12px]">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-muted/30 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Status & Region</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-semibold text-foreground">{d.region}</span>
            <Badge variant="outline" className="text-[9px] uppercase">{d.status}</Badge>
          </div>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Network Config</div>
          <div className="mt-1 font-mono text-[11px] text-foreground">
            {d.cidr ?? (d.asn !== undefined ? `ASN ${d.asn}` : d.middleboxKind ?? "N/A")}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Telemetry Metrics</div>
        <div className="space-y-1.5 rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Cpu className="h-3.5 w-3.5" /> CPU Load</span>
            <span className="font-mono font-medium">{d.cpuLoad !== undefined ? `${Math.round(d.cpuLoad)}%` : "N/A"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground"><MemoryStick className="h-3.5 w-3.5" /> Memory Load</span>
            <span className="font-mono font-medium">{d.memoryLoad !== undefined ? `${Math.round(d.memoryLoad)}%` : "N/A"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground"><TrendingDown className="h-3.5 w-3.5" /> Packet Loss</span>
            <span className="font-mono font-medium">{d.packetLoss !== undefined ? `${(d.packetLoss * 100).toFixed(3)}%` : "0.000%"}</span>
          </div>
        </div>
      </div>

      {result && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Routing State ({result.algorithm})</div>
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-card p-3">
            <div>
              <div className="text-[10px] text-muted-foreground">Shortest Distance</div>
              <div className="font-mono text-sm font-semibold text-cyan-300">
                {distance === undefined || distance === Infinity ? "∞" : `${distance.toFixed(1)} ms`}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Predecessor Node</div>
              <div className="font-mono text-sm font-semibold text-foreground">{predecessor ?? "None"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EdgeDetail({ edge, result }: { edge: NetVisEdge; result: AlgorithmResult | null }) {
  const d = edge.data;
  if (!d) return null;
  const sourceDist = result?.distances[edge.source];
  const targetDist = result?.distances[edge.target];
  const onActivePath = Boolean(d.onActivePath);

  return (
    <div className="space-y-4 p-4 text-[12px]">
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
        <div className="font-mono font-medium">{edge.source}</div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="font-mono font-medium">{edge.target}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border bg-card p-2.5">
          <div className="text-[10px] text-muted-foreground">Latency</div>
          <div className="font-mono text-sm font-semibold text-cyan-300">{d.latency.toFixed(1)} ms</div>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <div className="text-[10px] text-muted-foreground">Bandwidth</div>
          <div className="font-mono text-sm font-semibold text-foreground">{d.bandwidth} Mbps</div>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <div className="text-[10px] text-muted-foreground">Utilization</div>
          <div className="font-mono text-sm font-semibold text-amber-300">{(d.utilization * 100).toFixed(0)}%</div>
        </div>
        <div className="rounded-md border border-border bg-card p-2.5">
          <div className="text-[10px] text-muted-foreground">Protocol</div>
          <div className="font-mono text-sm font-semibold uppercase text-emerald-300">{d.protocol ?? "BGP"}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Routing State</div>
        <div className="space-y-1.5 rounded-md border border-border bg-muted/20 p-2.5 text-[11px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Source distance</span>
            <span className="font-mono text-cyan-300">{sourceDist === undefined || sourceDist === Infinity ? "∞" : `${sourceDist.toFixed(2)} ms`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Target distance</span>
            <span className="font-mono text-cyan-300">{targetDist === undefined || targetDist === Infinity ? "∞" : `${targetDist.toFixed(2)} ms`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">On active path</span>
            <span className={cn("font-mono", onActivePath ? "text-emerald-300" : "text-muted-foreground")}>{onActivePath ? "yes" : "no"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Suppress unused-import warnings for icons reserved for future expansion.
void Layers; void Activity; void Gauge;
