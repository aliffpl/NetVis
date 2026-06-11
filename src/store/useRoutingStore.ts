/**
 * NetVis — Routing Store Slice
 *
 * Owns algorithm selection, source/target nodes, routing result, step cursor,
 * and active path. Does NOT own topology nodes/edges — those live in
 * useTopologyStore. The routing result is recomputed by useNetworkSimulation
 * when topology/algorithm/source/target changes.
 */

"use client";

import { create } from "zustand";
import type { AlgorithmName, AlgorithmResult } from "@/types";

export interface RoutingSlice {
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
  setResult: (result: AlgorithmResult | null, activePathNodes: string[], activePathEdges: string[], stepCursor: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
}

export const useRoutingStore = create<RoutingSlice>((set, get) => ({
  algorithm: "dijkstra",
  setAlgorithm: (algorithm) => set({ algorithm }),
  sourceNode: "tehran-core",
  targetNode: "shiraz-clients",
  setSourceNode: (sourceNode) => set({ sourceNode }),
  setTargetNode: (targetNode) => set({ targetNode }),
  result: null,
  activePathNodes: [],
  activePathEdges: [],
  stepCursor: 0,
  setStepCursor: (stepCursor) => set({ stepCursor }),
  setResult: (result, activePathNodes, activePathEdges, stepCursor) =>
    set({ result, activePathNodes, activePathEdges, stepCursor }),
  stepForward: () => {
    const { result, stepCursor } = get();
    if (!result) return;
    if (stepCursor < result.steps.length - 1) set({ stepCursor: stepCursor + 1 });
  },
  stepBackward: () => {
    const { stepCursor } = get();
    if (stepCursor > 0) set({ stepCursor: stepCursor - 1 });
  },
}));
