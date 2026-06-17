/**
 * NetVis — UI Store Slice
 *
 * Owns selection state (which node/edge is inspected) and probe results.
 */

"use client";

import { create } from "zustand";
import type { ProbeResult, SelectedEntity } from "@/types";

export interface UiSlice {
  selected: SelectedEntity | null;
  setSelected: (s: SelectedEntity | null) => void;

  probes: ProbeResult[];
  addProbe: (p: ProbeResult) => void;
  updateProbe: (id: string, patch: Partial<ProbeResult>) => void;
  clearProbes: () => void;
}

export const useUiStore = create<UiSlice>((set, get) => ({
  selected: null,
  setSelected: (selected) => set({ selected }),

  probes: [],
  addProbe: (p) => set({ probes: [p, ...get().probes].slice(0, 50) }),
  updateProbe: (id, patch) =>
    set({
      probes: get().probes.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }),
  clearProbes: () => set({ probes: [] }),
}));
