/**
 * useTelemetryStream
 *
 * PHASE 1 REWRITE:
 *   - Uses the TelemetryServiceContext instead of creating its own service
 *   - Prunes expired anomalies on every tick (honors 8s TTL for injected anomalies)
 */

"use client";

import { useEffect, useRef } from "react";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useTelemetryService } from "@/services/telemetry/TelemetryServiceContext";
import { applyTopologyCountFallback } from "./telemetrySampleFallback";
import { canApplyTelemetryUpdate } from "./telemetryRequestGuard";

export function useTelemetryStream() {
  const status = useNetworkStore((s) => s.status);
  const dataSource = useNetworkStore((s) => s.dataSource);
  const tickMs = useNetworkStore((s) => s.tickMs);
  const pushTelemetry = useNetworkStore((s) => s.pushTelemetry);
  const injectAnomaly = useNetworkStore((s) => s.injectAnomaly);
  const telemetryService = useTelemetryService();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedErrorRef = useRef(false);
  const generationRef = useRef(0);
  const pruneRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Periodically prune expired anomalies (every 2 seconds)
    pruneRef.current = setInterval(() => {
      const state = useNetworkStore.getState();
      const now = Date.now();
      const pruned = state.anomalies.filter((a) => a.expiresAt === undefined || a.expiresAt > now);
      if (pruned.length !== state.anomalies.length) {
        useNetworkStore.setState({ anomalies: pruned });
      }
    }, 2000);

    return () => {
      if (pruneRef.current) clearInterval(pruneRef.current);
    };
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (status !== "running") return;
    const controller = new AbortController();
    const requestGeneration = ++generationRef.current;

    const tick = async () => {
      try {
        const [{ sample, anomalies }, nodeMetrics] = await Promise.all([
          telemetryService.fetchTick(controller.signal),
          telemetryService.fetchNodeMetrics(controller.signal),
        ]);
        if (!canApplyTelemetryUpdate(requestGeneration, generationRef.current, controller.signal, dataSource, useNetworkStore.getState().dataSource)) return;
        const state = useNetworkStore.getState();
        pushTelemetry(
          applyTopologyCountFallback(
            sample,
            state.nodes.filter((node) => node.data.status === "online").length,
            state.nodes.length,
          ),
          anomalies,
          nodeMetrics,
        );
        feedErrorRef.current = false;
      } catch (error) {
        if (!canApplyTelemetryUpdate(requestGeneration, generationRef.current, controller.signal, dataSource, useNetworkStore.getState().dataSource)) return;
        const message = error instanceof Error ? error.message : "RIPE Atlas unavailable";
        if (!feedErrorRef.current) {
          injectAnomaly({ kind: "route-flap", severity: "info", title: "RIPE Atlas feed unavailable", description: message });
          feedErrorRef.current = true;
        }
      }
    };

    tick();
    timerRef.current = setInterval(tick, Math.max(200, tickMs));

    return () => {
      controller.abort();
      generationRef.current = requestGeneration + 1;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status, dataSource, tickMs, pushTelemetry, injectAnomaly, telemetryService]);

  return { status, tickMs };
}
