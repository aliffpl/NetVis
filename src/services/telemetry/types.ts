import type { AnomalyEvent, NetVisEdge, NetVisNode, TelemetrySample } from "@/types";

export type TelemetryDataSource = "demo" | "api";

export interface NodeMetrics {
  cpuLoad: number;
  memoryLoad: number;
  packetLoss: number;
  lastUpdated: number;
}

export interface TelemetryTick {
  sample: TelemetrySample;
  anomalies: AnomalyEvent[];
}

export interface ITelemetryService {
  getTopology(): Promise<{ nodes: NetVisNode[]; edges: NetVisEdge[] }>;
  fetchTick(signal?: AbortSignal): Promise<TelemetryTick>;
  fetchNodeMetrics(signal?: AbortSignal): Promise<Record<string, NodeMetrics>>;
}
