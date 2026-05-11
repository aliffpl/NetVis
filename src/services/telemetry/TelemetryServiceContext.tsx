"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ITelemetryService, TelemetryDataSource } from "./types";
import { DemoTelemetryService } from "./DemoTelemetryService";
import { ApiTelemetryService } from "./ApiTelemetryService";

/**
 * TelemetryService Context
 *
 * PHASE 1: Provides a single memoized TelemetryService instance to the
 * entire app. The store no longer owns a simulator — the service is
 * created here based on the active dataSource and shared by all hooks
 * (useNetworkSimulation, useTelemetryStream, EndpointProbe).
 */

interface TelemetryServiceContextValue {
  service: ITelemetryService;
  dataSource: TelemetryDataSource;
}

const TelemetryServiceContext = createContext<TelemetryServiceContextValue | null>(null);

export function TelemetryServiceProvider({
  dataSource,
  children,
}: {
  dataSource: TelemetryDataSource;
  children: ReactNode;
}) {
  const service = useMemo<ITelemetryService>(() => {
    return dataSource === "api" ? new ApiTelemetryService() : new DemoTelemetryService();
  }, [dataSource]);

  const value = useMemo(() => ({ service, dataSource }), [service, dataSource]);

  return (
    <TelemetryServiceContext.Provider value={value}>
      {children}
    </TelemetryServiceContext.Provider>
  );
}

export function useTelemetryService(): ITelemetryService {
  const ctx = useContext(TelemetryServiceContext);
  if (!ctx) {
    // Fallback: create a demo service if no provider is mounted
    // (shouldn't happen in normal usage — provider is mounted in layout)
    return new DemoTelemetryService();
  }
  return ctx.service;
}

export function useTelemetryDataSource(): TelemetryDataSource {
  const ctx = useContext(TelemetryServiceContext);
  return ctx?.dataSource ?? "demo";
}
