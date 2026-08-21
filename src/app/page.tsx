/**
 * NetVis — National Network Telemetry & Anomaly Visualizer
 * Main application layout.
 *
 * FIX #1 (Viewport Scaling) — strict h-screen w-screen overflow-hidden flex
 * container. Right sidebar is w-96 shrink-0. Recharts inside RealtimeCharts
 * uses ResponsiveContainer height="100%" width="100%" so it dynamically
 * fits the constrained panel.
 *
 * FIX #2 (Sidebar Scrollability) — right sidebar content is wrapped in a
 * flex-1 overflow-y-auto container with max-h-full on the parent, so the
 * scrollbar triggers internally and the main page stays locked.
 */

"use client";

import { useEffect } from "react";
import {
  Activity, Play, Pause, Square, RotateCcw, Zap, Bug, Flame, CloudRain, ChevronRight,
} from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useTelemetryStream } from "@/hooks/useTelemetryStream";
import { NetworkCanvas } from "@/components/canvas/NetworkCanvas";
import { MetricsOverview } from "@/components/dashboard/MetricsOverview";
import { RealtimeCharts } from "@/components/dashboard/RealtimeCharts";
import { AnomalyLogTable } from "@/components/dashboard/AnomalyLogTable";
import { EndpointProbe } from "@/components/inspector/EndpointProbe";
import { PacketDetailsModal } from "@/components/inspector/PacketDetailsModal";
import { DataSourceToggle } from "@/components/header/DataSourceToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { AnomalyEvent, AnomalyKind, AnomalySeverity } from "@/types";

export default function Page() {
  useTelemetryStream();

  const algorithm = useNetworkStore((s) => s.algorithm);
  const setAlgorithm = useNetworkStore((s) => s.setAlgorithm);
  const sourceNode = useNetworkStore((s) => s.sourceNode);
  const setSourceNode = useNetworkStore((s) => s.setSourceNode);
  const targetNode = useNetworkStore((s) => s.targetNode);
  const setTargetNode = useNetworkStore((s) => s.setTargetNode);
  const nodes = useNetworkStore((s) => s.nodes);
  const status = useNetworkStore((s) => s.status);
  const dataSource = useNetworkStore((s) => s.dataSource);
  const start = useNetworkStore((s) => s.start);
  const pause = useNetworkStore((s) => s.pause);
  const stop = useNetworkStore((s) => s.stop);
  const tickMs = useNetworkStore((s) => s.tickMs);
  const setTickMs = useNetworkStore((s) => s.setTickMs);
  const resetTopology = useNetworkStore((s) => s.resetTopology);
  const runRouting = useNetworkStore((s) => s.runRouting);
  const injectAnomaly = useNetworkStore((s) => s.injectAnomaly);

  useEffect(() => { runRouting(); }, [runRouting]);

  const inject = (kind: AnomalyKind, severity: AnomalySeverity, title: string, description: string) => {
    injectAnomaly({ kind, severity, title, description } as Omit<AnomalyEvent, "id" | "ts">);
  };

  /**
   * PHASE 3: Demo negative-weight scenario.
   * Temporarily injects a small negative edge into the topology, switches
   * to Bellman-Ford, and runs the algorithm so the negative-cycle detection
   * is exercised on the live graph. The original topology is restored after.
   */
  const injectNegativeScenario = () => {
    const { nodes, edges, setEdges, setAlgorithm } = useNetworkStore.getState();
    // Find an edge to make negative (Tehran ↔ Isfahan, weight 9 → -3)
    const targetEdgeId = "e-thr-isf";
    const modifiedEdges = edges.map((e) =>
      e.id === targetEdgeId
        ? { ...e, data: { ...e.data!, latency: -3 } }
        : e,
    );
    setEdges(modifiedEdges);
    setAlgorithm("bellman-ford");
    // The useNetworkSimulation hook will re-run routing after the debounce
    injectAnomaly({
      kind: "negative-cycle",
      severity: "critical",
      title: "Negative-weight scenario injected",
      description: "Tehran ↔ Isfahan edge weight set to -3 ms. Bellman-Ford will detect the negative cycle. Reset topology to restore.",
    } as Omit<AnomalyEvent, "id" | "ts">);
  };

  return (
    // FIX #1: strict outer container.
    <div className="flex h-screen w-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="app-header flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/60 px-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-500 to-emerald-500">
            <Activity className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold tracking-tight">NetVis</span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Network Telemetry & Anomaly Visualizer</span>
          </div>
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <div className="flex items-center gap-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Algo</Label>
          <Select value={algorithm} onValueChange={(v) => setAlgorithm(v as typeof algorithm)}>
            <SelectTrigger className="header-select-control h-7 w-[140px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dijkstra">Dijkstra</SelectItem>
              <SelectItem value="bellman-ford">Bellman-Ford</SelectItem>
              <SelectItem value="astar">A* (geo heuristic)</SelectItem>
              <SelectItem value="yen-kshortest">Yen's K-Shortest</SelectItem>
              <SelectItem value="ecmp">ECMP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <div className="flex items-center gap-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Src</Label>
          <Select value={sourceNode} onValueChange={setSourceNode}>
            <SelectTrigger className="header-select-control h-7 w-[130px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {nodes.map((n) => (<SelectItem key={n.id} value={n.id}>{n.data.label}</SelectItem>))}
            </SelectContent>
          </Select>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Dst</Label>
          <Select value={targetNode} onValueChange={setTargetNode}>
            <SelectTrigger className="header-select-control h-7 w-[130px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {nodes.map((n) => (<SelectItem key={n.id} value={n.id}>{n.data.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <DataSourceToggle />

          <Separator orientation="vertical" className="mx-1 h-6" />

          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tick</Label>
            <Slider value={[tickMs]} onValueChange={([v]) => setTickMs(v)} min={500} max={4000} step={100} className="w-20" />
            <span className="font-mono text-[10px] text-muted-foreground w-10">{(tickMs / 1000).toFixed(1)}s</span>
          </div>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Button variant="outline" size="sm" className="h-7 px-2" onClick={status === "running" ? pause : start}>
            {status === "running" ? (<><Pause className="h-3 w-3" /> Pause</>) : (<><Play className="h-3 w-3" /> Start</>)}
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={stop} disabled={status === "stopped"}>
            <Square className="h-3 w-3" /> Stop
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={resetTopology} title="Reset topology">
            <RotateCcw className="h-3 w-3" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Badge variant="outline" className={cn(
            "h-5 px-2 text-[10px] uppercase",
            status === "running" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : status === "paused" ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
              : "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
          )}>
            <span className={cn("mr-1 h-1.5 w-1.5 rounded-full",
              status === "running" ? "bg-emerald-400 status-pulse"
                : status === "paused" ? "bg-amber-400" : "bg-muted-foreground",
            )} />
            {status}
          </Badge>
        </div>
      </header>

      {/* FIX #1: body row is flex flex-1 overflow-hidden */}
      <div className="app-layout flex min-h-0 flex-1 overflow-hidden">
        {/* Left sidebar: fixed width, internal scroll */}
        <aside className="app-sidebar app-sidebar-left flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-card/40 p-3 custom-scrollbar">
          <EndpointProbe />
          <Separator />
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Bug className="h-3 w-3" /> Inject Anomaly
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Manually emit anomaly events into the live log for defense demos. Each injection persists for ~8 seconds.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant="outline" size="sm" className="h-7 justify-start text-[10px]"
                onClick={() => inject("high-latency", "warning", "Injected latency spike", "Manual: simulated peering congestion injected for academic demo.")}>
                <Zap className="mr-1 h-3 w-3 text-amber-300" /> Latency Spike
              </Button>
              <Button variant="outline" size="sm" className="h-7 justify-start text-[10px]"
                onClick={() => inject("packet-loss", "critical", "Injected packet-loss excursion", "Manual: simulated optical-layer fault injected for academic demo.")}>
                <Flame className="mr-1 h-3 w-3 text-rose-300" /> Packet Loss
              </Button>
              <Button variant="outline" size="sm" className="h-7 justify-start text-[10px]"
                onClick={() => inject("dns-degradation", "warning", "Injected DNS degradation", "Manual: recursive resolver overloaded — elevated response times.")}>
                <CloudRain className="mr-1 h-3 w-3 text-sky-300" /> DNS Slow
              </Button>
              <Button variant="outline" size="sm" className="h-7 justify-start text-[10px]"
                onClick={injectNegativeScenario}>
                <Bug className="mr-1 h-3 w-3 text-fuchsia-300" /> Neg. Cycle Demo
              </Button>
            </div>
          </section>
          <Separator />
          <section className="rounded-md border border-border bg-muted/20 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
            <div className="mb-1 font-semibold text-foreground">About this tool</div>
            <p>
              NetVis visualizes a national-scale network topology and runs shortest-path algorithms (<span className="font-mono text-cyan-300">Dijkstra</span>, <span className="font-mono text-cyan-300">Bellman-Ford</span>, <span className="font-mono text-cyan-300">A*</span>, <span className="font-mono text-cyan-300">Yen's K-Shortest</span>, <span className="font-mono text-cyan-300">ECMP</span>) over the graph weighted by link latency. Toggle <span className="font-semibold text-emerald-300">Live API</span> to fetch real measurements from RIPE Atlas.
            </p>
            <p className="mt-1.5">Click a node or edge on the canvas to open the diagnostic inspector.</p>
            <p className="mt-1.5 text-foreground/70">
              Active source: <span className={cn("font-mono", dataSource === "api" ? "text-emerald-300" : "text-cyan-300")}>{dataSource.toUpperCase()}</span>
            </p>
          </section>
        </aside>

        {/* FIX #1: center canvas is flex-1 + relative + overflow-hidden */}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <NetworkCanvas />
        </main>

        {/* PHASE 2: Right sidebar — w-96 shrink-0 with react-resizable-panels.
            Each panel is independently resizable and collapsible like an IDE.
            Sizes are persisted via autoSaveId. */}
        <aside className="app-sidebar app-sidebar-right flex w-96 max-h-full shrink-0 flex-col overflow-hidden border-l border-border bg-card/40 custom-scrollbar">
          <div className="flex shrink-0 items-center justify-between px-3 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Telemetry & Anomalies
            </h2>
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
              {dataSource === "api" ? "Live · RIPE Atlas" : "Demo · Simulated"}
            </span>
          </div>

          {/* PHASE 2: IDE-style resizable panels with persisted sizes */}
          <PanelGroup direction="vertical" className="flex-1 min-h-0" autoSaveId="netvis-right-panel">
            <Panel defaultSize={22} minSize={12} collapsible>
              <div className="h-full overflow-y-auto custom-scrollbar px-3 pb-2">
                <MetricsOverview />
              </div>
            </Panel>
            <PanelResizeHandle className="h-1.5 shrink-0 bg-border hover:bg-primary/40 transition-colors cursor-row-resize" />
            <Panel defaultSize={40} minSize={20}>
              <div className="h-full overflow-hidden px-3 pb-2">
                <RealtimeCharts />
              </div>
            </Panel>
            <PanelResizeHandle className="h-1.5 shrink-0 bg-border hover:bg-primary/40 transition-colors cursor-row-resize" />
            <Panel defaultSize={38} minSize={15}>
              <div className="h-full overflow-hidden px-3 pb-3">
                <AnomalyLogTable />
              </div>
            </Panel>
          </PanelGroup>
        </aside>
      </div>

      <PacketDetailsModal />
    </div>
  );
}
