# Portfolio

## Overview

NetVis is a network telemetry visualization tool built on Next.js 16, React 19, TypeScript, Zustand, and React Flow. It models the Iranian national network as a 17-node weighted graph, runs five shortest-path algorithms, and integrates real measurements from RIPE Atlas.

## What the Project Demonstrates

**Algorithm implementation from scratch.** Dijkstra, Bellman-Ford, A\*, Yen's K-Shortest, and ECMP are all implemented in pure TypeScript with no graph library dependencies. Dijkstra and Bellman-Ford produce full step-by-step execution traces — each step records the current node, the edge being relaxed, whether it improved the distance, and a snapshot of all distances and predecessors.

**Real API integration.** The Live API mode calls the public RIPE Atlas API, parses real measurement results, and maps them onto the topology. This is not a mock — the `/api/ripe-atlas?mode=topology-sweep` endpoint probes all 17 node targets concurrently, aggregates the results, and derives node status, edge weights, and anomaly events from real probe outcomes.

**Store architecture.** The original god-object Zustand store was split into four focused slices: topology (nodes/edges/React Flow handlers), routing (algorithm/result/step cursor), telemetry (status/history/metrics/anomalies), and UI (selection/probes). A legacy facade provides backward compatibility while components migrate.

**UI engineering.** The right sidebar uses `react-resizable-panels` for IDE-style resizable sections. Custom React Flow nodes switch to compact mode below a zoom threshold. Custom edges compute the nearest handle pair for orthogonal routing. The Iran GeoJSON background is anchored to the React Flow viewport and scales with pan/zoom.

## Technical Highlights

### Routing Engine

The `runAlgorithm()` dispatcher accepts the algorithm name, nodes, edges, source, and target. Dijkstra and Bellman-Ford compute single-source shortest paths to all nodes. A\*, Yen's, and ECMP are point-to-point — they use the target for early exit or path collection.

A\* uses the haversine great-circle distance between node geo-coordinates as a heuristic, divided by 200 to convert km to approximate ms. This is admissible because geographic distance is a lower bound on network latency.

Yen's K-Shortest finds K=3 loopless paths by iteratively removing edges from previous paths and finding spur paths via Dijkstra. The primary path is highlighted solid; alternatives are included in the active path set.

ECMP discovers all equal-cost paths by running Dijkstra first, then doing a DFS from source to target, collecting all paths whose total cost matches the shortest.

### Live API Pipeline

The `/api/ripe-atlas?mode=topology-sweep` route:
1. Iterates 17 node targets defined in `LIVE_NODE_TARGETS`
2. Probes all targets concurrently via `Promise.all` with fallback support
3. Each probe: `findMeasurement()` → `fetchMeasurementResults()` → `parseAtlasResult()`
4. Returns `nodeOutcomes: Record<nodeId, ProbeOutcome>` plus aggregate sample

`ApiTelemetryService` overlays real outcomes onto the topology:
- Node status: `online` (succeeded, RTT < 100ms), `degraded` (succeeded, RTT > 100ms), `offline` (failed)
- Edge latency: average of endpoint RTTs
- Per-node metrics: CPU/MEM/loss derived from RTT (lower RTT → lower load)

A 5-second sweep cache prevents redundant calls. A circuit breaker opens after 3 consecutive failures.

### Immutable Updates

All node/edge updates produce new object references. Decorated nodes/edges (with `onActivePath`, `distance`, `predecessor`) are derived via `useMemo` at render time — never written back to the store. This prevents the infinite render loop that occurred in earlier versions.

### Anomaly Lifecycle

Manually injected anomalies carry an `expiresAt` timestamp (now + 8 seconds). A pruning interval runs every 2 seconds and removes expired entries. Live anomalies use a sequence counter in their IDs to prevent silent deduplication when rapid successive sweeps produce the same anomaly.

## Metrics

| Metric | Value |
|--------|-------|
| TypeScript files (NetVis-specific) | ~30 |
| Total source lines | ~3,500 |
| Routing algorithms | 5 |
| Custom React Flow node types | 4 |
| Zustand store slices | 4 |
| Tests | 35 (all passing) |
| ESLint errors | 0 |
| Bundle size (gzipped) | ~252 KB |
| Dijkstra runtime (17 nodes) | 0.47 ms |
| Bellman-Ford runtime | 0.72 ms |
| A\* runtime | 0.10 ms |
| Yen's K-Shortest runtime | 1.50 ms |
| Live API sweep duration | 1.6–4.0 s |

## Lessons Learned

**Don't write derived state back to the store.** An earlier version wrote decorated nodes (with distance, predecessor, onActivePath) back to the store via `setState`. This caused an infinite render loop. Fix: derive decorations at render time via `useMemo`.

**Align your projections.** The Iran map used `(lng - 44) * 50` while nodes used `((lng - 44) / 20) * 1600`. The map looked tiny. Fix: use the same projection formula for both.

**Cache concurrent API calls.** In a single tick, the store calls `getTopology()`, `fetchTick()`, and `fetchNodeMetrics()` — all of which needed the sweep data. Without caching, each method fired its own sweep request. Fix: 5-second TTL cache in `ApiTelemetryService`.

**Test with real APIs early.** The `ApiTelemetryService` was a stub that called a non-existent `/topology` endpoint. This wasn't caught for multiple iterations because Demo mode worked fine. Fix: implement the real endpoint and verify end-to-end.

**Memoize React Flow nodes.** Without `memo()`, every custom node re-rendered on every store change. With 17 nodes and telemetry ticking every 1.5s, that's 17 unnecessary re-renders per tick.
