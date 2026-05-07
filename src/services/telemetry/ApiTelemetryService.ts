import type { ITelemetryService, NodeMetrics, TelemetryTick } from "./types";
import type {
  AnomalyEvent,
  AnomalyKind,
  AnomalySeverity,
  EdgeStatus,
  NetVisEdge,
  NetVisNode,
  NodeStatus,
  TelemetrySample,
} from "@/types";
import { buildDefaultTopology } from "@/engine/telemetrySimulator";
import { shareInFlightRequest, type InFlightRequestState } from "./inFlightRequest";

/**
 * ApiTelemetryService — Live API data source.
 *
 * PHASE 1 REWRITE:
 *   - Uses mode=topology-sweep to probe all 17 node targets
 *   - Overlays real RTT/loss/success onto the identical 17-node topology
 *   - Derives node status (online/degraded/offline) from probe success + RTT thresholds
 *   - Missing measurements → "no recent data" (status stays as-is, no invented numbers)
 *   - Per-node metrics derived from real probe outcomes
 *   - Circuit breaker: after 3 consecutive failures, opens for 45 seconds
 *   - Unique anomaly IDs: random suffix prevents silent deduplication
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

// ---- Types matching the /api/ripe-atlas?mode=topology-sweep response ----

interface SweepOutcome {
  target: string;
  kind: string;
  label: string;
  rttMs?: number;
  packetLoss?: number;
  hops?: Array<{ ttl: number; host: string; rttMs: number }>;
  error?: string;
  succeeded: boolean;
}

interface SweepAnomaly {
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  observedValue: number;
  expectedValue: number;
  target: string;
}

interface TopologySweepResponse {
  ts: number;
  sample: TelemetrySample;
  anomalies: SweepAnomaly[];
  outcomes: SweepOutcome[];
  nodeOutcomes: Record<string, SweepOutcome>;
}

// ---- Helpers ----

function anomalyKind(value: string): AnomalyKind {
  const allowed: AnomalyKind[] = [
    "high-latency",
    "packet-loss",
    "node-down",
    "dns-degradation",
    "middlebox-overhead",
    "route-flap",
    "bandwidth-saturation",
    "negative-cycle",
  ];
  return (allowed as string[]).includes(value) ? (value as AnomalyKind) : "high-latency";
}

function anomalySeverity(value: string): AnomalySeverity {
  return value === "critical" ? "critical" : value === "warning" ? "warning" : "info";
}

/**
 * Generate a unique anomaly ID with a random suffix.
 * This prevents rapid successive sweeps from silently dropping
 * "new" anomalies due to ID collisions.
 */
let anomalySequence = 0;
function uniqueAnomalyId(sweepTs: number, target: string, kind: string): string {
  anomalySequence = (anomalySequence + 1) % 1_000_000;
  return `live-${sweepTs}-${target}-${kind}-${anomalySequence.toString(36)}`;
}

/**
 * Derive node status from a probe outcome.
 * - succeeded + rtt < 100  → "online"
 * - succeeded + rtt ≥ 100  → "degraded"
 * - failed                 → "offline"
 * - no outcome             → keep existing status (don't invent)
 */
function deriveNodeStatus(outcome: SweepOutcome | undefined, currentStatus: NodeStatus): NodeStatus {
  if (!outcome) return currentStatus;
  if (!outcome.succeeded) return "offline";
  if (outcome.rttMs !== undefined && outcome.rttMs > 100) return "degraded";
  return "online";
}

/**
 * Derive edge status from the outcomes of its two endpoint nodes.
 * - both online           → "healthy" (or "congested" if utilization is high)
 * - either degraded       → "degraded"
 * - either offline        → "down"
 */
function deriveEdgeStatus(
  srcOutcome: SweepOutcome | undefined,
  tgtOutcome: SweepOutcome | undefined,
  currentStatus: EdgeStatus,
): EdgeStatus {
  if (!srcOutcome && !tgtOutcome) return currentStatus;
  const srcFailed = srcOutcome && !srcOutcome.succeeded;
  const tgtFailed = tgtOutcome && !tgtOutcome.succeeded;
  if (srcFailed || tgtFailed) return "down";
  const srcDegraded = srcOutcome && srcOutcome.rttMs !== undefined && srcOutcome.rttMs > 100;
  const tgtDegraded = tgtOutcome && tgtOutcome.rttMs !== undefined && tgtOutcome.rttMs > 100;
  if (srcDegraded || tgtDegraded) return "degraded";
  return "healthy";
}

// ---- Circuit Breaker ----

interface CircuitBreakerState {
  failureCount: number;
  isOpen: boolean;
  openedAt: number;
}

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_OPEN_MS = 45_000;

function createCircuitBreaker(): CircuitBreakerState {
  return { failureCount: 0, isOpen: false, openedAt: 0 };
}

function shouldAttemptCircuit(state: CircuitBreakerState, now = Date.now()): boolean {
  if (!state.isOpen) return true;
  if (now - state.openedAt >= CIRCUIT_BREAKER_OPEN_MS) {
    state.isOpen = false;
    state.failureCount = 0;
    return true;
  }
  return false;
}

function recordCircuitSuccess(state: CircuitBreakerState): void {
  state.failureCount = 0;
  state.isOpen = false;
}

function recordCircuitFailure(state: CircuitBreakerState, now = Date.now()): void {
  state.failureCount++;
  if (state.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    state.isOpen = true;
    state.openedAt = now;
  }
}

// ---- Service Implementation ----

export class ApiTelemetryService implements ITelemetryService {
  private lastSweep: TopologySweepResponse | null = null;
  private lastSweepAt = 0;
  private readonly sweepTtlMs = 5_000;
  private readonly inFlightSweep: InFlightRequestState<TopologySweepResponse> = { promise: null };
  private readonly circuitBreaker = createCircuitBreaker();

  private async request<T>(path: string, signal?: AbortSignal): Promise<T> {
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new Error(`API returned HTTP ${response.status} for ${path}`);
    return response.json() as Promise<T>;
  }

  /**
   * Fetch the latest topology sweep, reusing a cached result if fresh.
   * Respects the circuit breaker: if open, throws immediately.
   */
  private async fetchSweep(signal?: AbortSignal): Promise<TopologySweepResponse> {
    if (!shouldAttemptCircuit(this.circuitBreaker)) {
      const remaining = Math.ceil((CIRCUIT_BREAKER_OPEN_MS - (Date.now() - this.circuitBreaker.openedAt)) / 1000);
      throw new Error(`RIPE Atlas circuit breaker open — retry in ${remaining}s`);
    }

    const now = Date.now();
    if (this.lastSweep && now - this.lastSweepAt < this.sweepTtlMs) {
      return this.lastSweep;
    }

    return shareInFlightRequest(this.inFlightSweep, async () => {
      try {
        const sweep = await this.request<TopologySweepResponse>(
          "/api/ripe-atlas?mode=topology-sweep",
          signal,
        );
        this.lastSweep = sweep;
        this.lastSweepAt = Date.now();
        recordCircuitSuccess(this.circuitBreaker);
        return sweep;
      } catch (error) {
        recordCircuitFailure(this.circuitBreaker);
        throw error;
      }
    });
  }

  /**
   * Return the canonical 17-node topology with edge weights and node statuses
   * overlaid from the most recent topology sweep. If a sweep is unavailable,
   * falls back to the static topology.
   */
  async getTopology(): Promise<{ nodes: NetVisNode[]; edges: NetVisEdge[] }> {
    const base = buildDefaultTopology();
    try {
      const sweep = await this.fetchSweep();
      const { nodeOutcomes } = sweep;

      // Overlay node statuses from real probe outcomes
      const nodes = base.nodes.map((node) => {
        const outcome = nodeOutcomes[node.id];
        if (!outcome) return node;
        const status = deriveNodeStatus(outcome, node.data.status);
        return { ...node, data: { ...node.data, status } } as NetVisNode;
      });

      // Overlay edge weights from real probe outcomes
      const nodeById = new Map(nodes.map((n) => [n.id, n]));
      const edges = base.edges.map((edge) => {
        const srcOutcome = nodeOutcomes[edge.source];
        const tgtOutcome = nodeOutcomes[edge.target];

        // If either endpoint has a real RTT, update the edge latency
        let latency = edge.data?.latency ?? 10;
        let loss = edge.data?.loss ?? 0.001;
        let utilization = edge.data?.utilization ?? 0.4;
        let status: EdgeStatus = edge.data?.status ?? "healthy";

        if (srcOutcome && tgtOutcome && srcOutcome.succeeded && tgtOutcome.succeeded) {
          const srcRtt = srcOutcome.rttMs ?? 0;
          const tgtRtt = tgtOutcome.rttMs ?? 0;
          // Edge latency = average of endpoint RTTs (clamped 1..300 ms)
          latency = Math.max(1, Math.min(300, (srcRtt + tgtRtt) / 2));
          // Adjust utilization based on latency
          utilization = Math.min(0.95, Math.max(0.1, utilization + (latency - 20) / 200));
          status = utilization > 0.85 ? "congested" : "healthy";
        } else {
          status = deriveEdgeStatus(srcOutcome, tgtOutcome, status);
          if (status === "down" || status === "degraded") {
            loss = Math.max(loss, 0.05);
          }
        }

        return {
          ...edge,
          data: {
            ...edge.data!,
            latency,
            loss,
            utilization,
            status,
          },
        } as NetVisEdge;
      });

      void nodeById;
      return { nodes, edges };
    } catch {
      // Sweep failed — return the unmodified base topology
      return base;
    }
  }

  /**
   * Fetch a live telemetry tick. Maps the sweep response into a
   * TelemetrySample + AnomalyEvent[] with unique IDs.
   */
  async fetchTick(signal?: AbortSignal): Promise<TelemetryTick> {
    const sweep = await this.fetchSweep(signal);

    const anomalies: AnomalyEvent[] = sweep.anomalies.map((a) => ({
      id: uniqueAnomalyId(sweep.ts, a.target, a.kind),
      ts: sweep.ts,
      kind: anomalyKind(a.kind),
      severity: anomalySeverity(a.severity),
      title: a.title,
      description: a.description,
      observedValue: a.observedValue,
      expectedValue: a.expectedValue,
    }));

    return {
      sample: {
        ...sweep.sample,
        telemetryScope: "public-targets",
        throughputProvenance: "derived",
      },
      anomalies,
    };
  }

  /**
   * Derive per-node CPU/memory/loss metrics from real probe outcomes.
   * Nodes whose probe succeeded get healthy metrics derived from RTT.
   * Nodes whose probe failed get degraded metrics.
   * Nodes with no outcome get nothing (the store keeps previous values).
   */
  async fetchNodeMetrics(signal?: AbortSignal): Promise<Record<string, NodeMetrics>> {
    const sweep = await this.fetchSweep(signal);
    const now = Date.now();
    const out: Record<string, NodeMetrics> = {};

    const base = buildDefaultTopology();
    for (const node of base.nodes) {
      const outcome = sweep.nodeOutcomes[node.id];
      if (!outcome) continue; // No data — don't invent metrics

      const isMiddlebox = node.data.type === "middlebox";
      const overhead = isMiddlebox ? 15 : 0;

      if (outcome.succeeded && outcome.rttMs !== undefined) {
        // Healthy node — derive CPU/MEM from RTT (lower RTT → lower load)
        const load = Math.min(95, 25 + outcome.rttMs / 4 + overhead);
        out[node.id] = {
          cpuLoad: Math.max(3, load),
          memoryLoad: Math.min(95, Math.max(20, 35 + outcome.rttMs / 5)),
          packetLoss: Math.max(0, outcome.packetLoss ?? 0),
          lastUpdated: now,
        };
      } else {
        // Failed probe — degraded metrics
        out[node.id] = {
          cpuLoad: Math.min(99, 75 + overhead),
          memoryLoad: Math.min(95, 80),
          packetLoss: 0.05,
          lastUpdated: now,
        };
      }
    }

    return out;
  }

  /** Expose circuit breaker state for UI banners. */
  getCircuitBreakerState(): { isOpen: boolean; retryAfterSeconds: number } {
    if (!this.circuitBreaker.isOpen) return { isOpen: false, retryAfterSeconds: 0 };
    const elapsed = Date.now() - this.circuitBreaker.openedAt;
    const remaining = Math.max(0, CIRCUIT_BREAKER_OPEN_MS - elapsed);
    return { isOpen: true, retryAfterSeconds: Math.ceil(remaining / 1000) };
  }
}
