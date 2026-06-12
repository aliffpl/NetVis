/**
 * NetVis — Telemetry Store Slice
 *
 * Owns simulation status, dataSource, tickMs, telemetry history, metrics,
 * anomalies, and the pushTelemetry/injectAnomaly actions.
 *
 * Does NOT own a TelemetrySimulator instance — that lives in the
 * DemoTelemetryService which is created by the TelemetryServiceProvider.
 */

"use client";

import { create } from "zustand";
import type {
  AnomalyEvent,
  MetricsOverview,
  SimulationStatus,
  TelemetrySample,
} from "@/types";
import type { NodeMetrics, TelemetryDataSource } from "@/services/telemetry/types";
import { buildDefaultTopology } from "@/engine/telemetrySimulator";

const MAX_TELEMETRY_HISTORY = 60;
const MAX_ANOMALY_LOG = 100;
const INJECTED_ANOMALY_TTL_MS = 8_000;

const initialTopology = buildDefaultTopology();

/**
 * Callback registry for cross-store communication.
 * The app registers a callback here so the telemetry store can update
 * the topology store's nodes without a circular module dependency.
 */
export const telemetryStoreCallbacks: {
  onNodeMetrics?: (metrics: Record<string, NodeMetrics>) => void;
} = {};

export function registerTelemetryCallback(name: "onNodeMetrics", fn: (metrics: Record<string, NodeMetrics>) => void): void {
  telemetryStoreCallbacks[name] = fn;
}

export interface TelemetrySlice {
  status: SimulationStatus;
  dataSource: TelemetryDataSource;
  setDataSource: (dataSource: TelemetryDataSource) => void;
  start: () => void;
  pause: () => void;
  stop: () => void;
  tickMs: number;
  setTickMs: (ms: number) => void;

  telemetryHistory: TelemetrySample[];
  metrics: MetricsOverview;
  anomalies: AnomalyEvent[];
  pushTelemetry: (sample: TelemetrySample, newAnomalies: AnomalyEvent[], nodeMetrics?: Record<string, NodeMetrics>) => void;
  acknowledgeAnomaly: (id: string) => void;
  clearAnomalies: () => void;
  injectAnomaly: (event: Omit<AnomalyEvent, "id" | "ts">) => void;
  pruneExpiredAnomalies: () => void;
}

let injectSequence = 0;

export const useTelemetryStore = create<TelemetrySlice>((set, get) => ({
  status: "stopped",
  dataSource: "demo",
  setDataSource: (dataSource) => set({ dataSource }),
  start: () => set({ status: "running" }),
  pause: () => set({ status: "paused" }),
  stop: () => set({ status: "stopped" }),
  tickMs: 1500,
  setTickMs: (tickMs) => set({ tickMs }),

  telemetryHistory: [],
  metrics: {
    avgLatency: 0,
    p95Latency: 0,
    throughput: 0,
    packetLoss: 0,
    anomalyCount: 0,
    nodesOnline: initialTopology.nodes.filter((n) => n.data.status === "online").length,
    nodeCount: initialTopology.nodes.length,
    latencyDeltaPct: 0,
    lossDeltaPct: 0,
  },
  anomalies: [],

  pushTelemetry: (sample, newAnomalies, adapterMetrics) => {
    const state = get();
    const telemetryHistory = [...state.telemetryHistory, sample].slice(-MAX_TELEMETRY_HISTORY);
    // Dedupe anomalies by ID
    const seen = new Set(state.anomalies.map((a) => a.id));
    const freshAnomalies = newAnomalies.filter((a) => !seen.has(a.id));
    // Prune expired anomalies
    const now = Date.now();
    const pruned = state.anomalies.filter((a) => a.expiresAt === undefined || a.expiresAt > now);
    const anomalies = [...freshAnomalies, ...pruned].slice(0, MAX_ANOMALY_LOG);

    const baseline = telemetryHistory[0];
    const latencyDeltaPct = baseline
      ? ((sample.avgLatency - baseline.avgLatency) / Math.max(1, baseline.avgLatency)) * 100
      : 0;
    const lossDeltaPct = baseline
      ? ((sample.packetLoss - baseline.packetLoss) / Math.max(0.0001, baseline.packetLoss)) * 100
      : 0;

    const metrics: MetricsOverview = {
      avgLatency: sample.avgLatency,
      p95Latency: sample.p95Latency,
      throughput: sample.throughput,
      packetLoss: sample.packetLoss,
      anomalyCount: sample.anomalyCount,
      nodesOnline: sample.nodesOnline,
      nodeCount: sample.nodeCount,
      latencyDeltaPct,
      lossDeltaPct,
      telemetryScope: sample.telemetryScope,
      throughputProvenance: sample.throughputProvenance,
    };

    // Apply node metrics immutably (new object references)
    // We update the topology store via a callback registered by the app.
    // This avoids a circular module dependency.
    if (adapterMetrics && telemetryStoreCallbacks.onNodeMetrics) {
      telemetryStoreCallbacks.onNodeMetrics(adapterMetrics);
    }

    set({ telemetryHistory, anomalies, metrics });
  },

  acknowledgeAnomaly: (id) =>
    set({
      anomalies: get().anomalies.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
    }),

  clearAnomalies: () => set({ anomalies: [] }),

  injectAnomaly: (event) => {
    injectSequence = (injectSequence + 1) % 1_000_000;
    const now = Date.now();
    const injected: AnomalyEvent = {
      ...event,
      id: `inj-${now}-${injectSequence.toString(36)}`,
      ts: now,
      expiresAt: now + INJECTED_ANOMALY_TTL_MS,
    };
    set({ anomalies: [injected, ...get().anomalies].slice(0, MAX_ANOMALY_LOG) });
  },

  pruneExpiredAnomalies: () => {
    const now = Date.now();
    const pruned = get().anomalies.filter((a) => a.expiresAt === undefined || a.expiresAt > now);
    if (pruned.length !== get().anomalies.length) {
      set({ anomalies: pruned });
    }
  },
}));
