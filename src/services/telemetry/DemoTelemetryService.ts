import type { ITelemetryService } from "./types";
import { TelemetrySimulator, buildDefaultTopology } from "@/engine/telemetrySimulator";

/**
 * DemoTelemetryService — Deterministic simulation data source.
 *
 * Owns its own TelemetrySimulator instance. The store no longer
 * owns a simulator — each service manages its own lifecycle.
 */
export class DemoTelemetryService implements ITelemetryService {
  private simulator: TelemetrySimulator;

  constructor() {
    const { nodes, edges } = buildDefaultTopology();
    this.simulator = new TelemetrySimulator(nodes, edges, { seed: 0xc0ffee });
  }

  async getTopology() {
    return buildDefaultTopology();
  }

  async fetchTick() {
    return this.simulator.tick();
  }

  async fetchNodeMetrics() {
    return this.simulator.nodeMetrics(Date.now());
  }
}
