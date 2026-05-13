/**
 * useNetworkSimulation
 *
 * PHASE 1 REWRITE:
 *   - Uses the TelemetryServiceContext instead of creating its own service
 *   - Debounces topology-revision for routing (re-runs only after drag end
 *     or short idle, not on every position change)
 *   - Derives decorated nodes/edges immutably via useMemo
 */

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useTelemetryService } from "@/services/telemetry/TelemetryServiceContext";
import { reconstructPath, pathEdgeIds, runAlgorithm } from "@/engine/routingAlgorithms";
import type { AlgorithmResult, NetVisEdge, NetVisNode } from "@/types";
import { routingTopologyRevision } from "./routingTopologyRevision";

const ROUTING_DEBOUNCE_MS = 300;

export function useNetworkSimulation() {
  const dataSource = useNetworkStore((s) => s.dataSource);
  const nodes = useNetworkStore((s) => s.nodes);
  const edges = useNetworkStore((s) => s.edges);
  const algorithm = useNetworkStore((s) => s.algorithm);
  const sourceNode = useNetworkStore((s) => s.sourceNode);
  const targetNode = useNetworkStore((s) => s.targetNode);
  const result = useNetworkStore((s) => s.result);
  const activePathNodes = useNetworkStore((s) => s.activePathNodes);
  const activePathEdges = useNetworkStore((s) => s.activePathEdges);
  const stepCursor = useNetworkStore((s) => s.stepCursor);
  const topologyRevision = useMemo(() => routingTopologyRevision(nodes, edges), [nodes, edges]);

  const telemetryService = useTelemetryService();

  // Debounced routing re-computation
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const current = useNetworkStore.getState();
      const routingResult = runAlgorithm(
        current.algorithm,
        current.nodes,
        current.edges,
        current.sourceNode,
        current.targetNode,
      );

      // For multi-path algorithms (Yen's, ECMP), use the first path for highlighting
      // and collect all path edge IDs for multi-path highlighting
      let activePathNodes: string[] = [];
      let activePathEdges: string[] = [];

      if (routingResult.paths && routingResult.paths.length > 0) {
        // Multi-path: highlight all paths
        const allNodes = new Set<string>();
        const allEdges = new Set<string>();
        for (const p of routingResult.paths) {
          p.nodeIds.forEach((n) => allNodes.add(n));
          p.edgeIds.forEach((e) => allEdges.add(e));
        }
        activePathNodes = [...allNodes];
        activePathEdges = [...allEdges];
      } else {
        // Single-path: use predecessor-based reconstruction
        const path = reconstructPath(routingResult.predecessors, current.sourceNode, current.targetNode);
        activePathNodes = path ?? [];
        activePathEdges = pathEdgeIds(current.edges, path);
      }

      useNetworkStore.setState({
        result: routingResult,
        activePathNodes,
        activePathEdges,
        stepCursor: routingResult.steps.length - 1,
      });
    }, ROUTING_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [algorithm, sourceNode, targetNode, topologyRevision]);

  // Hydrate topology when dataSource changes
  useEffect(() => {
    let cancelled = false;
    telemetryService.getTopology().then((topology) => {
      if (cancelled) return;
      if (useNetworkStore.getState().dataSource === dataSource) {
        useNetworkStore.setState({ nodes: topology.nodes, edges: topology.edges });
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [dataSource, telemetryService]);

  const stepSnapshot = useMemo(() => {
    if (!result) return null;
    return result.steps[Math.min(stepCursor, result.steps.length - 1)] ?? null;
  }, [result, stepCursor]);

  // Immutable decorated nodes (new object references)
  const decoratedNodes: NetVisNode[] = useMemo(() => nodes.map((node) => {
    const distance = stepSnapshot?.distances[node.id];
    const visitIndex = stepSnapshot?.visited.indexOf(node.id) ?? -1;
    return {
      ...node,
      data: {
        ...node.data,
        distance: distance === undefined || distance === Infinity ? undefined : distance,
        predecessor: stepSnapshot?.predecessors[node.id] ?? null,
        visitOrder: visitIndex < 0 ? undefined : visitIndex,
        onActivePath: activePathNodes.includes(node.id),
      },
    };
  }), [nodes, stepSnapshot, activePathNodes]);

  // Immutable decorated edges (new object references)
  const decoratedEdges: NetVisEdge[] = useMemo(() => edges.map((edge) => ({
    ...edge,
    data: edge.data ? { ...edge.data, onActivePath: activePathEdges.includes(edge.id) } : edge.data,
  })), [edges, activePathEdges]);

  return { nodes: decoratedNodes, edges: decoratedEdges, result, stepCursor, stepSnapshot, telemetryService };
}
