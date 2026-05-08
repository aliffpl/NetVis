/**
 * NetVis — Legacy Store Facade
 *
 * This file provides backwards compatibility with the old god-object
 * useNetworkStore by composing the four focused slices:
 *   - useTopologyStore  (nodes, edges, React Flow handlers)
 *   - useRoutingStore   (algorithm, source/target, result, step cursor)
 *   - useTelemetryStore (status, dataSource, history, metrics, anomalies)
 *   - useUiStore        (selected, probes)
 *
 * The simulator instance has been REMOVED from the store. It now lives
 * exclusively in DemoTelemetryService, which is created by the
 * TelemetryServiceProvider.
 *
 * Components should migrate to importing the focused slices directly.
 * This facade exists to avoid a big-bang rewrite of every component.
 */

"use client";

import { create } from "zustand";
import { useTopologyStore } from "./useTopologyStore";
import { useRoutingStore } from "./useRoutingStore";
import { useTelemetryStore } from "./useTelemetryStore";
import { useUiStore } from "./useUiStore";
import type {
  AlgorithmName,
  AlgorithmResult,
  AnomalyEvent,
  MetricsOverview,
  NetVisEdge,
  NetVisNode,
  ProbeResult,
  SelectedEntity,
  SimulationStatus,
  TelemetrySample,
} from "@/types";
import type { NodeMetrics, TelemetryDataSource } from "@/services/telemetry/types";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react";
import { buildDefaultTopology } from "@/engine/telemetrySimulator";
import { pathEdgeIds, reconstructPath, runAlgorithm } from "@/engine/routingAlgorithms";

const initialTopology = buildDefaultTopology();

export interface NetworkStoreState {
  // Topology
  nodes: NetVisNode[];
  edges: NetVisEdge[];
  onNodesChange: OnNodesChange<NetVisNode>;
  onEdgesChange: OnEdgesChange<NetVisEdge>;
  applyNodeChanges: (changes: NodeChange<NetVisNode>[], nodes: NetVisNode[]) => NetVisNode[];
  applyEdgeChanges: (changes: EdgeChange<NetVisEdge>[], edges: NetVisEdge[]) => NetVisEdge[];
  setNodes: (nodes: NetVisNode[]) => void;
  setEdges: (edges: NetVisEdge[]) => void;

  // UI
  selected: SelectedEntity | null;
  setSelected: (s: SelectedEntity | null) => void;

  // Routing
  algorithm: AlgorithmName;
  setAlgorithm: (a: AlgorithmName) => void;
  sourceNode: string;
  setSourceNode: (id: string) => void;
  targetNode: string;
  setTargetNode: (id: string) => void;
  result: AlgorithmResult | null;
  activePathNodes: string[];
  activePathEdges: string[];
  stepCursor: number;
  setStepCursor: (i: number) => void;
  runRouting: () => void;
  stepForward: () => void;
  stepBackward: () => void;

  // Telemetry
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

  // Probes
  probes: ProbeResult[];
  addProbe: (p: ProbeResult) => void;
  updateProbe: (id: string, patch: Partial<ProbeResult>) => void;

  resetTopology: () => void;
}

/**
 * The legacy store composes state from the focused slices and delegates
 * actions to them. This ensures a single source of truth while allowing
 * gradual migration.
 */
export const useNetworkStore = create<NetworkStoreState>((set, get) => ({
  // ---- Topology (delegated to useTopologyStore) ----
  nodes: useTopologyStore.getState().nodes,
  edges: useTopologyStore.getState().edges,
  applyNodeChanges: (changes, nodes) => applyNodeChanges(changes, nodes) as NetVisNode[],
  applyEdgeChanges: (changes, edges) => applyEdgeChanges(changes, edges) as NetVisEdge[],
  onNodesChange: (changes) => {
    const topo = useTopologyStore.getState();
    const newNodes = topo.applyNodeChanges(changes, topo.nodes);
    useTopologyStore.setState({ nodes: newNodes });
    set({ nodes: newNodes });
  },
  onEdgesChange: (changes) => {
    const topo = useTopologyStore.getState();
    const newEdges = topo.applyEdgeChanges(changes, topo.edges);
    useTopologyStore.setState({ edges: newEdges });
    set({ edges: newEdges });
  },
  setNodes: (nodes) => {
    useTopologyStore.setState({ nodes });
    set({ nodes });
  },
  setEdges: (edges) => {
    useTopologyStore.setState({ edges });
    set({ edges });
  },

  // ---- UI (delegated to useUiStore) ----
  selected: useUiStore.getState().selected,
  setSelected: (selected) => {
    useUiStore.setState({ selected });
    set({ selected });
  },

  // ---- Routing (delegated to useRoutingStore) ----
  algorithm: useRoutingStore.getState().algorithm,
  setAlgorithm: (algorithm) => {
    useRoutingStore.setState({ algorithm });
    set({ algorithm });
  },
  sourceNode: useRoutingStore.getState().sourceNode,
  setSourceNode: (sourceNode) => {
    useRoutingStore.setState({ sourceNode });
    set({ sourceNode });
  },
  targetNode: useRoutingStore.getState().targetNode,
  setTargetNode: (targetNode) => {
    useRoutingStore.setState({ targetNode });
    set({ targetNode });
  },
  result: useRoutingStore.getState().result,
  activePathNodes: useRoutingStore.getState().activePathNodes,
  activePathEdges: useRoutingStore.getState().activePathEdges,
  stepCursor: useRoutingStore.getState().stepCursor,
  setStepCursor: (stepCursor) => {
    useRoutingStore.setState({ stepCursor });
    set({ stepCursor });
  },
  runRouting: () => {
    const { nodes, edges } = get();
    const { algorithm, sourceNode, targetNode } = get();
    const result = runAlgorithm(algorithm, nodes, edges, sourceNode);
    const path = reconstructPath(result.predecessors, sourceNode, targetNode);
    const pathEdges = pathEdgeIds(edges, path);
    const routingState = {
      result,
      activePathNodes: path ?? [],
      activePathEdges: pathEdges,
      stepCursor: result.steps.length - 1,
    };
    useRoutingStore.setState(routingState);
    set(routingState);
  },
  stepForward: () => {
    useRoutingStore.getState().stepForward();
    set({ stepCursor: useRoutingStore.getState().stepCursor });
  },
  stepBackward: () => {
    useRoutingStore.getState().stepBackward();
    set({ stepCursor: useRoutingStore.getState().stepCursor });
  },

  // ---- Telemetry (delegated to useTelemetryStore) ----
  status: useTelemetryStore.getState().status,
  dataSource: useTelemetryStore.getState().dataSource,
  setDataSource: (dataSource) => {
    useTelemetryStore.setState({ dataSource });
    set({ dataSource });
  },
  start: () => {
    useTelemetryStore.getState().start();
    set({ status: useTelemetryStore.getState().status });
  },
  pause: () => {
    useTelemetryStore.getState().pause();
    set({ status: useTelemetryStore.getState().status });
  },
  stop: () => {
    useTelemetryStore.getState().stop();
    set({ status: useTelemetryStore.getState().status });
  },
  tickMs: useTelemetryStore.getState().tickMs,
  setTickMs: (tickMs) => {
    useTelemetryStore.setState({ tickMs });
    set({ tickMs });
  },
  telemetryHistory: useTelemetryStore.getState().telemetryHistory,
  metrics: useTelemetryStore.getState().metrics,
  anomalies: useTelemetryStore.getState().anomalies,
  pushTelemetry: (sample, newAnomalies, nodeMetrics) => {
    useTelemetryStore.getState().pushTelemetry(sample, newAnomalies, nodeMetrics);
    const t = useTelemetryStore.getState();
    set({ telemetryHistory: t.telemetryHistory, anomalies: t.anomalies, metrics: t.metrics, nodes: useTopologyStore.getState().nodes });
  },
  acknowledgeAnomaly: (id) => {
    useTelemetryStore.getState().acknowledgeAnomaly(id);
    set({ anomalies: useTelemetryStore.getState().anomalies });
  },
  clearAnomalies: () => {
    useTelemetryStore.getState().clearAnomalies();
    set({ anomalies: useTelemetryStore.getState().anomalies });
  },
  injectAnomaly: (event) => {
    useTelemetryStore.getState().injectAnomaly(event);
    set({ anomalies: useTelemetryStore.getState().anomalies });
  },

  // ---- Probes (delegated to useUiStore) ----
  probes: useUiStore.getState().probes,
  addProbe: (p) => {
    useUiStore.getState().addProbe(p);
    set({ probes: useUiStore.getState().probes });
  },
  updateProbe: (id, patch) => {
    useUiStore.getState().updateProbe(id, patch);
    set({ probes: useUiStore.getState().probes });
  },

  // ---- Reset ----
  resetTopology: () => {
    const topo = buildDefaultTopology();
    useTopologyStore.setState({ nodes: topo.nodes, edges: topo.edges });
    useRoutingStore.setState({
      result: null, activePathNodes: [], activePathEdges: [], stepCursor: 0,
    });
    useTelemetryStore.setState({ anomalies: [], telemetryHistory: [] });
    useUiStore.setState({ selected: null });
    set({
      nodes: topo.nodes, edges: topo.edges, selected: null,
      result: null, activePathNodes: [], activePathEdges: [], stepCursor: 0,
      anomalies: [], telemetryHistory: [],
    });
  },
}));

// Sync: when topology store changes, reflect in legacy store
useTopologyStore.subscribe((state) => {
  useNetworkStore.setState({ nodes: state.nodes, edges: state.edges });
});

// Sync: when routing store changes, reflect in legacy store
useRoutingStore.subscribe((state) => {
  useNetworkStore.setState({
    algorithm: state.algorithm,
    sourceNode: state.sourceNode,
    targetNode: state.targetNode,
    result: state.result,
    activePathNodes: state.activePathNodes,
    activePathEdges: state.activePathEdges,
    stepCursor: state.stepCursor,
  });
});

// Sync: when telemetry store changes, reflect in legacy store
useTelemetryStore.subscribe((state) => {
  useNetworkStore.setState({
    status: state.status,
    dataSource: state.dataSource,
    tickMs: state.tickMs,
    telemetryHistory: state.telemetryHistory,
    metrics: state.metrics,
    anomalies: state.anomalies,
  });
});

// Sync: when UI store changes, reflect in legacy store
useUiStore.subscribe((state) => {
  useNetworkStore.setState({ selected: state.selected, probes: state.probes });
});
