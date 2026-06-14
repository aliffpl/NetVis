/**
 * NetVis — Topology Store Slice
 *
 * Owns the network nodes/edges and React Flow change handlers.
 * Does NOT own routing results, telemetry, or the simulator.
 */

"use client";

import { create } from "zustand";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react";
import type { NetVisEdge, NetVisNode } from "@/types";
import { buildDefaultTopology } from "@/engine/telemetrySimulator";

export interface TopologySlice {
  nodes: NetVisNode[];
  edges: NetVisEdge[];
  onNodesChange: OnNodesChange<NetVisNode>;
  onEdgesChange: OnEdgesChange<NetVisEdge>;
  applyNodeChanges: (changes: NodeChange<NetVisNode>[], nodes: NetVisNode[]) => NetVisNode[];
  applyEdgeChanges: (changes: EdgeChange<NetVisEdge>[], edges: NetVisEdge[]) => NetVisEdge[];
  setNodes: (nodes: NetVisNode[]) => void;
  setEdges: (edges: NetVisEdge[]) => void;
  resetTopology: () => void;
}

const initialTopology = buildDefaultTopology();

export const useTopologyStore = create<TopologySlice>((set, get) => ({
  nodes: initialTopology.nodes,
  edges: initialTopology.edges,
  applyNodeChanges: (changes, nodes) => applyNodeChanges(changes, nodes) as NetVisNode[],
  applyEdgeChanges: (changes, edges) => applyEdgeChanges(changes, edges) as NetVisEdge[],
  onNodesChange: (changes) => {
    set({ nodes: get().applyNodeChanges(changes, get().nodes) });
  },
  onEdgesChange: (changes) => {
    set({ edges: get().applyEdgeChanges(changes, get().edges) });
  },
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  resetTopology: () => {
    const topo = buildDefaultTopology();
    set({ nodes: topo.nodes, edges: topo.edges });
  },
}));
