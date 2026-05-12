import type { TelemetrySample } from "../types";

export function applyTopologyCountFallback(
  sample: TelemetrySample,
  topologyNodesOnline: number,
  topologyNodeCount: number,
): TelemetrySample {
  return {
    ...sample,
    nodesOnline: sample.nodesOnline ?? topologyNodesOnline,
    nodeCount: sample.nodeCount ?? topologyNodeCount,
  };
}

