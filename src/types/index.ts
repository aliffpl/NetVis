/**
 * NetVis — National Network Telemetry & Anomaly Visualizer
 * Strict TypeScript type definitions for the entire application.
 */

// ============================================================================
// Network Topology Types
// ============================================================================

export type NodeType = "router" | "middlebox" | "edge-server" | "client";
export type NodeStatus = "online" | "degraded" | "offline" | "maintenance" | "no-data";
export type MiddleboxKind = "dpi" | "firewall" | "nat" | "load-balancer" | "ids";

export interface GeoCoordinate {
  lat: number;
  lng: number;
}

export interface NetworkNodeData {
  label: string;
  type: NodeType;
  status: NodeStatus;
  asn?: number;
  cidr?: string;
  region: string;
  middleboxKind?: MiddleboxKind;
  distance?: number;
  predecessor?: string | null;
  visitOrder?: number;
  cpuLoad?: number;
  memoryLoad?: number;
  packetLoss?: number;
  lastUpdated?: number;
  geo?: GeoCoordinate;
  onActivePath?: boolean;
  selected?: boolean;
  note?: string;
  [key: string]: unknown;
}

export type EdgeStatus = "healthy" | "congested" | "degraded" | "down";

export interface NetworkEdgeData {
  label?: string;
  directed?: boolean;
  latency: number;
  bandwidth: number;
  loss: number;
  utilization: number;
  status: EdgeStatus;
  onActivePath?: boolean;
  relaxed?: boolean;
  protocol?: "bgp" | "ospf" | "isis" | "static";
  [key: string]: unknown;
}

// ============================================================================
// React Flow Type Aliases
// ============================================================================

import type { Node, Edge } from "@xyflow/react";

export type NetVisNode = Node<NetworkNodeData, NodeType>;
export type NetVisEdge = Edge<NetworkEdgeData>;

// ============================================================================
// Routing Algorithm Types
// ============================================================================

export type AlgorithmName = "dijkstra" | "bellman-ford" | "astar" | "yen-kshortest" | "ecmp";

export interface AlgorithmStep {
  stepIndex: number;
  description: string;
  currentNode?: string;
  edge?: { source: string; target: string };
  improved: boolean;
  distances: Record<string, number>;
  predecessors: Record<string, string | null>;
  visited: string[];
  negativeCycle?: boolean;
}

export interface AlgorithmResult {
  algorithm: AlgorithmName;
  source: string;
  distances: Record<string, number>;
  predecessors: Record<string, string | null>;
  steps: AlgorithmStep[];
  hasNegativeCycle: boolean;
  durationMs: number;
  /** Multi-path results (Yen's K-shortest, ECMP). Empty for single-path algorithms. */
  paths?: Array<{ nodeIds: string[]; edgeIds: string[]; cost: number }>;
  /** Summary for non-step-trace algorithms (A*, Yen's, ECMP). */
  summary?: string;
}

// ============================================================================
// Telemetry & Anomaly Types
// ============================================================================

export type TelemetryScope = "topology" | "public-targets";
export type MetricProvenance = "live" | "derived";

export interface TelemetrySample {
  ts: number;
  avgLatency: number;
  p95Latency: number;
  throughput: number;
  packetLoss: number;
  anomalyCount: number;
  nodesOnline: number;
  nodeCount: number;
  validSampleCount?: number;
  failureCount?: number;
  telemetryScope?: TelemetryScope;
  throughputProvenance?: MetricProvenance;
}

export type AnomalySeverity = "info" | "warning" | "critical";
export type AnomalyKind =
  | "high-latency"
  | "packet-loss"
  | "node-down"
  | "dns-degradation"
  | "middlebox-overhead"
  | "route-flap"
  | "bandwidth-saturation"
  | "negative-cycle";

export interface AnomalyEvent {
  id: string;
  ts: number;
  kind: AnomalyKind;
  severity: AnomalySeverity;
  title: string;
  description: string;
  nodeIds?: string[];
  edgeIds?: string[];
  observedValue?: number;
  expectedValue?: number;
  acknowledged?: boolean;
  /** Epoch millis when this anomaly should auto-expire (for manually injected anomalies). */
  expiresAt?: number;
}

// ============================================================================
// Endpoint Probe Types
// ============================================================================

export type ProbeKind = "http" | "dns" | "icmp" | "traceroute";
export type ProbeStatus = "pending" | "running" | "success" | "failed" | "timeout";

export interface ProbeResult {
  id: string;
  ts: number;
  kind: ProbeKind;
  target: string;
  status: ProbeStatus;
  rttMs?: number;
  statusCode?: number;
  resolvedAddresses?: string[];
  hops?: Array<{ ttl: number; host: string; rttMs: number }>;
  error?: string;
}

// ============================================================================
// UI / Store Types
// ============================================================================

export type SimulationStatus = "running" | "paused" | "stopped";

export interface MetricsOverview {
  avgLatency: number;
  p95Latency: number;
  throughput: number;
  packetLoss: number;
  anomalyCount: number;
  nodesOnline: number;
  nodeCount: number;
  latencyDeltaPct: number;
  lossDeltaPct: number;
  telemetryScope?: TelemetryScope;
  throughputProvenance?: MetricProvenance;
}

export interface SelectedEntity {
  kind: "node" | "edge";
  id: string;
}
