import type { NetVisEdge, NetVisNode } from "../types";

export function routingTopologyRevision(nodes: NetVisNode[], edges: NetVisEdge[]): string {
  return JSON.stringify({
    nodes: nodes.map((node) => node.id),
    edges: edges.map((edge) => [edge.id, edge.source, edge.target, edge.data?.latency ?? 1]),
  });
}

