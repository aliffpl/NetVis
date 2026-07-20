"use client";

import { useEffect } from "react";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useTopologyStore } from "@/store/useTopologyStore";
import { TelemetryServiceProvider } from "@/services/telemetry/TelemetryServiceContext";
import { registerTelemetryCallback } from "@/store/useTelemetryStore";

/**
 * Bridge component that:
 *   1. Reads the active dataSource from the store and wraps children in
 *      the TelemetryServiceProvider (single memoized service instance).
 *   2. Registers a cross-store callback so the telemetry store can update
 *      the topology store's nodes immutably when new metrics arrive.
 */
export function TelemetryServiceProviderBridge({ children }: { children: React.ReactNode }) {
  const dataSource = useNetworkStore((s) => s.dataSource);

  // Register the cross-store callback for immutable node metric updates
  useEffect(() => {
    registerTelemetryCallback("onNodeMetrics", (metrics) => {
      const topo = useTopologyStore.getState();
      const updatedNodes = topo.nodes.map((n) => {
        const m = metrics[n.id];
        if (!m) return n;
        return { ...n, data: { ...n.data, ...m } };
      });
      useTopologyStore.setState({ nodes: updatedNodes });
    });
  }, []);

  return (
    <TelemetryServiceProvider dataSource={dataSource}>
      {children}
    </TelemetryServiceProvider>
  );
}
