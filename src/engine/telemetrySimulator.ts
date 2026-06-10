/**
 * NetVis — Telemetry Simulator
 *
 * Generates pseudo-realistic streaming telemetry samples and anomaly events
 * for a given network topology. Designed to mimic a WebSocket / SSE feed
 * without requiring a backend.
 *
 * The simulator is deterministic-per-seed for reproducibility in academic
 * demos: pass the same `seed` and the sequence of values will match.
 */

import type {
  AnomalyEvent,
  AnomalyKind,
  AnomalySeverity,
  NetVisEdge,
  NetVisNode,
  TelemetrySample,
} from "@/types";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulatorOptions {
  seed?: number;
  tickMs?: number;
}

export class TelemetrySimulator {
  private rng: () => number;
  private tickCount = 0;
  private nodes: NetVisNode[];
  private edges: NetVisEdge[];
  private baselineLatency: number;
  private baselineLoss: number;
  private injectedAnomalies: AnomalyEvent[] = [];

  constructor(nodes: NetVisNode[], edges: NetVisEdge[], opts: SimulatorOptions = {}) {
    this.nodes = nodes;
    this.edges = edges;
    this.rng = mulberry32(opts.seed ?? 0x5eed);
    const sumLatency = edges.reduce((s, e) => s + (e.data?.latency ?? 0), 0);
    this.baselineLatency = edges.length ? sumLatency / edges.length : 12;
    this.baselineLoss = edges.length
      ? edges.reduce((s, e) => s + (e.data?.loss ?? 0), 0) / edges.length
      : 0.001;
  }

  tick(now: number = Date.now()): { sample: TelemetrySample; anomalies: AnomalyEvent[] } {
    this.tickCount++;
    const r = this.rng;

    const drift = 1 + Math.sin(this.tickCount / 9) * 0.15 + (r() - 0.5) * 0.2;
    const spike = r() > 0.92 ? r() * 80 : 0;
    const lossSpike = r() > 0.95 ? r() * 0.03 : 0;

    const avgLatency = Math.max(2, this.baselineLatency * drift + spike);
    const p95Latency = avgLatency * (1.4 + r() * 0.5);
    const throughput = Math.max(50, 1000 - avgLatency * 4 + (r() - 0.5) * 120);
    const packetLoss = Math.max(0, this.baselineLoss * drift * 5 + lossSpike);
    const nodesOnline = this.nodes.filter((n) => n.data.status === "online").length;

    const anomalies: AnomalyEvent[] = [];
    if (spike > 40) {
      anomalies.push(this.makeAnomaly(now, "high-latency", "warning", avgLatency, this.baselineLatency));
    }
    if (lossSpike > 0.015) {
      anomalies.push(this.makeAnomaly(now, "packet-loss", "critical", packetLoss, this.baselineLoss));
    }
    if (r() > 0.97) {
      anomalies.push(this.makeAnomaly(now, "dns-degradation", "warning", 200 + r() * 600, 80));
    }
    if (r() > 0.985) {
      anomalies.push(this.makeAnomaly(now, "middlebox-overhead", "info", 30 + r() * 25, 8));
    }

    const sample: TelemetrySample = {
      ts: now,
      avgLatency,
      p95Latency,
      throughput,
      packetLoss,
      anomalyCount: anomalies.length,
      nodesOnline,
      nodeCount: this.nodes.length,
    };
    return { sample, anomalies };
  }

  private makeAnomaly(
    ts: number,
    kind: AnomalyKind,
    severity: AnomalySeverity,
    observed: number,
    expected: number,
  ): AnomalyEvent {
    const titles: Record<AnomalyKind, string> = {
      "high-latency": "Latency spike detected",
      "packet-loss": "Packet-loss excursion",
      "node-down": "Node unreachable",
      "dns-degradation": "DNS resolution degradation",
      "middlebox-overhead": "Middlebox processing overhead",
      "route-flap": "Route-flap detected",
      "bandwidth-saturation": "Bandwidth saturation",
      "negative-cycle": "Negative-weight cycle in route graph",
    };
    const descriptions: Record<AnomalyKind, string> = {
      "high-latency": `Observed ${observed.toFixed(1)} ms vs baseline ${expected.toFixed(1)} ms — possibly congested peering or queueing delay.`,
      "packet-loss": `Loss ratio ${(observed * 100).toFixed(2)}% exceeds baseline ${(expected * 100).toFixed(2)}% — investigate physical layer or bufferbloat.`,
      "node-down": `Heartbeat lost from router — BGP sessions may be withdrawing prefixes.`,
      "dns-degradation": `Recursive resolver response time ${observed.toFixed(0)} ms exceeds SLA of ${expected.toFixed(0)} ms.`,
      "middlebox-overhead": `Middlebox added ~${observed.toFixed(1)} ms — DPI inspection queue or NAT table walk.`,
      "route-flap": `BGP route oscillation detected — prefix withdrawn and re-announced repeatedly.`,
      "bandwidth-saturation": `Link utilization crossed 90% — consider ECMP rebalancing.`,
      "negative-cycle": `Bellman-Ford flagged a negative-weight cycle — likely a misconfigured route metric or counter-route.`,
    };
    return {
      id: `anom-${ts}-${Math.floor(this.rng() * 1e6).toString(36)}`,
      ts,
      kind,
      severity,
      title: titles[kind],
      description: descriptions[kind],
      observedValue: observed,
      expectedValue: expected,
    };
  }

  injectAnomaly(event: Omit<AnomalyEvent, "id" | "ts">): AnomalyEvent {
    const full: AnomalyEvent = {
      ...event,
      id: `inj-${Date.now()}-${Math.floor(this.rng() * 1e6).toString(36)}`,
      ts: Date.now(),
    };
    this.injectedAnomalies.push(full);
    if (this.injectedAnomalies.length > 5) this.injectedAnomalies.shift();
    return full;
  }

  nodeMetrics(now: number): Record<string, { cpuLoad: number; memoryLoad: number; packetLoss: number; lastUpdated: number }> {
    const out: Record<string, { cpuLoad: number; memoryLoad: number; packetLoss: number; lastUpdated: number }> = {};
    for (const node of this.nodes) {
      const r = this.rng();
      const isMiddlebox = node.data.type === "middlebox";
      const overhead = isMiddlebox ? 15 : 0;
      out[node.id] = {
        cpuLoad: Math.min(99, Math.max(3, 30 + r * 50 + overhead)),
        memoryLoad: Math.min(95, Math.max(20, 40 + r * 40)),
        packetLoss: Math.max(0, r * 0.005),
        lastUpdated: now,
      };
    }
    return out;
  }
}

/**
 * Build a canonical national-scale topology with realistic Iranian city
 * naming (matches the academic-defense narrative of "National Network").
 *
 * FIX #2 (Node Overlap): The geographic (lat,lng) → (x,y) projection has
 * been widened so the nodes spread across the full canvas instead of
 * piling on top of one another. The multipliers below map the Iranian
 * bounding box (roughly lng 44..64, lat 25..40) into a 1600×1200 canvas
 * with comfortable padding. React Flow's `fitView` prop (set in
 * NetworkCanvas.tsx) auto-scales the wider spread into the viewport.
 */
export function buildDefaultTopology(): { nodes: NetVisNode[]; edges: NetVisEdge[] } {
  const nodes: NetVisNode[] = [
    { id: "tehran-core", type: "router", position: { x: 0, y: 0 }, data: { label: "Tehran Core", type: "router", status: "online", asn: 29049, cidr: "10.0.0.0/24", region: "Tehran", geo: { lat: 35.6892, lng: 51.3890 } } },
    { id: "mashhad-core", type: "router", position: { x: 0, y: 0 }, data: { label: "Mashhad Core", type: "router", status: "online", asn: 29049, cidr: "10.0.1.0/24", region: "Razavi Khorasan", geo: { lat: 36.2972, lng: 59.6062 } } },
    { id: "isfahan-core", type: "router", position: { x: 0, y: 0 }, data: { label: "Isfahan Core", type: "router", status: "online", asn: 29049, cidr: "10.0.2.0/24", region: "Isfahan", geo: { lat: 32.6539, lng: 51.6660 } } },
    { id: "shiraz-core", type: "router", position: { x: 0, y: 0 }, data: { label: "Shiraz Core", type: "router", status: "online", asn: 29049, cidr: "10.0.3.0/24", region: "Fars", geo: { lat: 29.5918, lng: 52.5837 } } },
    { id: "tabriz-core", type: "router", position: { x: 0, y: 0 }, data: { label: "Tabriz Core", type: "router", status: "online", asn: 29049, cidr: "10.0.4.0/24", region: "East Azerbaijan", geo: { lat: 38.0800, lng: 46.2919 } } },
    { id: "ahvaz-core", type: "router", position: { x: 0, y: 0 }, data: { label: "Ahvaz Core", type: "router", status: "online", asn: 29049, cidr: "10.0.5.0/24", region: "Khuzestan", geo: { lat: 31.3183, lng: 48.6706 } } },

    { id: "tehran-dpi", type: "middlebox", position: { x: 0, y: 0 }, data: { label: "Tehran DPI", type: "middlebox", status: "online", middleboxKind: "dpi", region: "Tehran" } },
    { id: "tehran-fw", type: "middlebox", position: { x: 0, y: 0 }, data: { label: "Tehran FW", type: "middlebox", status: "online", middleboxKind: "firewall", region: "Tehran" } },
    { id: "isfahan-nat", type: "middlebox", position: { x: 0, y: 0 }, data: { label: "Isfahan NAT", type: "middlebox", status: "online", middleboxKind: "nat", region: "Isfahan" } },
    { id: "mashhad-lb", type: "middlebox", position: { x: 0, y: 0 }, data: { label: "Mashhad LB", type: "middlebox", status: "degraded", middleboxKind: "load-balancer", region: "Razavi Khorasan" } },

    { id: "tehran-edge", type: "edge-server", position: { x: 0, y: 0 }, data: { label: "Tehran Edge CDN", type: "edge-server", status: "online", cidr: "10.10.0.0/22", region: "Tehran" } },
    { id: "isfahan-edge", type: "edge-server", position: { x: 0, y: 0 }, data: { label: "Isfahan DC", type: "edge-server", status: "online", cidr: "10.10.4.0/22", region: "Isfahan" } },
    { id: "shiraz-edge", type: "edge-server", position: { x: 0, y: 0 }, data: { label: "Shiraz Edge", type: "edge-server", status: "online", cidr: "10.10.8.0/22", region: "Fars" } },

    { id: "tehran-clients", type: "client", position: { x: 0, y: 0 }, data: { label: "Tehran Clients", type: "client", status: "online", cidr: "10.20.0.0/16", region: "Tehran" } },
    { id: "mashhad-clients", type: "client", position: { x: 0, y: 0 }, data: { label: "Mashhad Clients", type: "client", status: "online", cidr: "10.21.0.0/16", region: "Razavi Khorasan" } },
    { id: "tabriz-clients", type: "client", position: { x: 0, y: 0 }, data: { label: "Tabriz Clients", type: "client", status: "online", cidr: "10.22.0.0/16", region: "East Azerbaijan" } },
    { id: "shiraz-clients", type: "client", position: { x: 0, y: 0 }, data: { label: "Shiraz Clients", type: "client", status: "degraded", cidr: "10.23.0.0/16", region: "Fars" } },
  ];

  const mkEdge = (
    id: string, source: string, target: string,
    latency: number, bandwidth: number, loss: number, utilization: number,
    protocol: "bgp" | "ospf" | "isis" | "static" = "bgp", label?: string,
  ): NetVisEdge => {
    const status: import("@/types").EdgeStatus =
      utilization > 0.95 || loss > 0.05 ? "down"
      : loss > 0.02 ? "degraded"
      : utilization > 0.85 ? "congested" : "healthy";
    return { id, source, target, type: "netvis", animated: true,
      data: { latency, bandwidth, loss, utilization, status, protocol, label, directed: false } };
  };

  const edges: NetVisEdge[] = [
    mkEdge("e-thr-msh", "tehran-core", "mashhad-core", 18, 10000, 0.0008, 0.42, "bgp", "Tehran ↔ Mashhad"),
    mkEdge("e-thr-isf", "tehran-core", "isfahan-core", 9, 10000, 0.0004, 0.55, "bgp", "Tehran ↔ Isfahan"),
    mkEdge("e-isf-shz", "isfahan-core", "shiraz-core", 12, 10000, 0.0009, 0.38, "bgp", "Isfahan ↔ Shiraz"),
    mkEdge("e-thr-tbz", "tehran-core", "tabriz-core", 16, 10000, 0.0006, 0.41, "bgp", "Tehran ↔ Tabriz"),
    mkEdge("e-isf-ahv", "isfahan-core", "ahvaz-core", 14, 10000, 0.0011, 0.49, "bgp", "Isfahan ↔ Ahvaz"),
    mkEdge("e-ahv-shz", "ahvaz-core", "shiraz-core", 22, 10000, 0.0014, 0.31, "bgp", "Ahvaz ↔ Shiraz"),
    mkEdge("e-tbz-ahv", "tabriz-core", "ahvaz-core", 28, 10000, 0.0019, 0.22, "bgp", "Tabriz ↔ Ahvaz"),
    mkEdge("e-thr-dpi", "tehran-core", "tehran-dpi", 4, 10000, 0.0002, 0.6, "ospf", "→ DPI"),
    mkEdge("e-dpi-isf", "tehran-dpi", "isfahan-core", 11, 10000, 0.0007, 0.5, "ospf", "DPI → Isfahan"),
    mkEdge("e-thr-fw", "tehran-core", "tehran-fw", 3, 10000, 0.0001, 0.7, "ospf", "→ FW"),
    mkEdge("e-fw-msh", "tehran-fw", "mashhad-core", 17, 10000, 0.0005, 0.45, "ospf", "FW → Mashhad"),
    mkEdge("e-isf-nat", "isfahan-core", "isfahan-nat", 2, 10000, 0.0001, 0.55, "ospf", "→ NAT"),
    mkEdge("e-nat-shz", "isfahan-nat", "shiraz-core", 13, 10000, 0.0008, 0.41, "ospf", "NAT → Shiraz"),
    mkEdge("e-msh-lb", "mashhad-core", "mashhad-lb", 5, 10000, 0.0012, 0.78, "ospf", "→ LB"),
    mkEdge("e-lb-thr", "mashhad-lb", "tehran-core", 19, 10000, 0.0018, 0.62, "ospf", "LB → Tehran"),
    mkEdge("e-thr-edge", "tehran-dpi", "tehran-edge", 2, 10000, 0.0001, 0.65, "static", "→ Edge CDN"),
    mkEdge("e-isf-edge", "isfahan-nat", "isfahan-edge", 2, 10000, 0.0001, 0.55, "static", "→ DC"),
    mkEdge("e-shz-edge", "shiraz-core", "shiraz-edge", 3, 10000, 0.0003, 0.42, "static", "→ Edge"),
    mkEdge("e-thr-cli", "tehran-edge", "tehran-clients", 7, 1000, 0.0015, 0.71, "static", "→ Clients"),
    mkEdge("e-msh-cli", "mashhad-lb", "mashhad-clients", 8, 1000, 0.0021, 0.83, "static", "→ Clients"),
    mkEdge("e-tbz-cli", "tabriz-core", "tabriz-clients", 6, 1000, 0.0011, 0.55, "static", "→ Clients"),
    mkEdge("e-shz-cli", "shiraz-edge", "shiraz-clients", 5, 1000, 0.0042, 0.91, "static", "→ Clients"),
  ];

  // ---- Geographic projection with co-located node separation ----
  // Base projection: x = ((lng - 44) / 20) * 1600, y = ((40 - lat) / 13) * 1200
  // Then apply per-node offsets to separate co-located nodes (e.g. the 5
  // Tehran-area nodes that are within 0.5° of each other) while keeping
  // them in their geographic province.
  const nodeGeo: Record<string, { lat: number; lng: number }> = {
    "tehran-dpi": { lat: 35.55, lng: 51.5 }, "tehran-fw": { lat: 35.82, lng: 51.2 },
    "isfahan-nat": { lat: 32.45, lng: 51.85 }, "mashhad-lb": { lat: 36.48, lng: 59.8 },
    "tehran-edge": { lat: 35.35, lng: 51.85 }, "isfahan-edge": { lat: 32.5, lng: 52.0 },
    "shiraz-edge": { lat: 29.75, lng: 52.8 }, "tehran-clients": { lat: 35.55, lng: 52.2 },
    "mashhad-clients": { lat: 36.05, lng: 60.0 }, "tabriz-clients": { lat: 38.0, lng: 46.0 },
    "shiraz-clients": { lat: 29.35, lng: 52.25 },
  };

  // Per-node pixel offsets applied after the base projection.
  // These spread co-located nodes just enough so their cards don't overlap,
  // while keeping them clustered in their province.
  const nodeOffsets: Record<string, { dx: number; dy: number }> = {
    // Tehran area: spread the 5 nodes around the core
    "tehran-core":    { dx: 0,    dy: 0 },
    "tehran-dpi":     { dx: -90,  dy: 50 },
    "tehran-fw":      { dx: -80,  dy: -65 },
    "tehran-edge":    { dx: 100,  dy: 40 },
    "tehran-clients": { dx: 140,  dy: -15 },
    // Isfahan area
    "isfahan-nat":    { dx: -70,  dy: 35 },
    "isfahan-edge":   { dx: 80,   dy: 50 },
    // Mashhad area
    "mashhad-lb":     { dx: -65,  dy: -40 },
    "mashhad-clients":{ dx: 65,   dy: 35 },
    // Shiraz area
    "shiraz-edge":    { dx: 65,   dy: -30 },
    "shiraz-clients": { dx: -50,  dy: 55 },
    // Tabriz
    "tabriz-clients": { dx: -55,  dy: 40 },
  };

  const projectedNodes = nodes.map((node) => {
    const geo = node.data.geo ?? nodeGeo[node.id];
    if (!geo) return node;
    const baseX = ((geo.lng - 44) / 20) * 1600;
    const baseY = ((40 - geo.lat) / 13) * 1200;
    const offset = nodeOffsets[node.id] ?? { dx: 0, dy: 0 };
    return { ...node, position: { x: baseX + offset.dx, y: baseY + offset.dy } };
  });

  return { nodes: projectedNodes, edges };
}
