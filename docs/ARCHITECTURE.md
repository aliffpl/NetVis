# Architecture

## Store Design

The original codebase used a single Zustand store that held topology, routing state, telemetry history, anomalies, probes, and a `TelemetrySimulator` instance. This created tight coupling between unrelated concerns and made the store a god-object.

The refactored design splits state into four focused stores:

**useTopologyStore** — nodes, edges, React Flow change handlers (`onNodesChange`, `onEdgesChange`), `setNodes`, `setEdges`, `resetTopology`. Node positions update immediately on drag; edge weights are overlaid by the telemetry service when live data arrives.

**useRoutingStore** — algorithm name, source/target node IDs, `AlgorithmResult`, step cursor, active path nodes/edges. The result is a derived value recomputed by `useNetworkSimulation` when topology, algorithm, source, or target changes. The store exposes only `setStepCursor` and `stepForward`/`stepBackward` for manual navigation.

**useTelemetryStore** — simulation status, data source, tick cadence, rolling telemetry history (60 samples), metrics overview, anomaly log (100 entries). The `pushTelemetry` action applies node metrics immutably via a registered callback to `useTopologyStore` — this avoids a circular module dependency while ensuring new object references on every update.

**useUiStore** — selected entity (node/edge for the inspector modal) and probe results (50 entries max).

A legacy `useNetworkStore` facade composes all four stores and syncs state via `subscribe()`. This allows gradual migration of components without a big-bang rewrite.

## Telemetry Service Provider

A React context (`TelemetryServiceProvider`) creates a single memoized `ITelemetryService` instance based on the active `dataSource`. Previously, both `useNetworkSimulation` and `useTelemetryStream` created their own service instances on every `dataSource` change, leading to duplicate fetches and inconsistent lifecycles. The provider ensures one instance is shared across the app.

The store no longer owns a `TelemetrySimulator`. That class lives exclusively inside `DemoTelemetryService`, which is instantiated by the provider when `dataSource === "demo"`.

## Live API Pipeline

When `dataSource === "api"`, `ApiTelemetryService` calls `/api/ripe-atlas?mode=topology-sweep`. This route:

1. Iterates the 17 node targets defined in `LIVE_NODE_TARGETS` (each node maps to a real RIPE Atlas target with fallbacks)
2. Probes all 17 targets concurrently via `Promise.all`
3. Each probe calls `findMeasurement()` → `fetchMeasurementResults()` → `parseAtlasResult()`
4. Returns a `nodeOutcomes: Record<nodeId, ProbeOutcome>` map plus the aggregate telemetry sample

`ApiTelemetryService.getTopology()` overlays real RTT/loss/status onto the static topology. `fetchNodeMetrics()` derives CPU/memory/loss from real probe outcomes — successful probes produce healthy metrics scaled by RTT; failed probes produce degraded metrics.

A 5-second sweep cache prevents redundant RIPE Atlas calls across the three concurrent store methods (topology + tick + nodeMetrics). A circuit breaker opens after 3 consecutive failures for 45 seconds.

## Routing Engine

Five algorithms operate on the same latency-weighted graph:

**Dijkstra** and **Bellman-Ford** produce full step-by-step traces. Each step records the current node, the edge being relaxed, whether it improved the distance, and a snapshot of all distances/predecessors/visited nodes. Bellman-Ford performs |V|-1 relaxation passes with early termination, then one additional pass for negative-cycle detection.

**A\*** uses the haversine great-circle distance between node geo-coordinates as a heuristic, divided by 200 to convert km to approximate ms (fiber propagation speed). The heuristic is admissible — geographic distance never exceeds network distance. A\* exits early when the target is reached.

**Yen's K-Shortest** finds K=3 loopless paths by iteratively removing edges from previous shortest paths and finding spur paths via Dijkstra. The primary path is highlighted solid; alternatives are included in the active path set.

**ECMP** discovers all equal-cost shortest paths by running Dijkstra first to find the shortest cost, then doing a DFS from source to target, collecting all paths whose total cost matches.

The `runAlgorithm()` dispatcher accepts the algorithm name, nodes, edges, source, and target. Dijkstra and Bellman-Ford ignore the target parameter (they compute single-source shortest paths to all nodes). A\*, Yen's, and ECMP use it for point-to-point computation.

## React Flow Integration

Custom nodes use `useStore((s) => s.transform[2])` to read the current zoom level. Below zoom 0.55, nodes switch to compact mode — narrower width, smaller icon, no CIDR/ASN/CPU bar. Full details are shown when a node is selected, regardless of zoom.

Custom edges compute the optimal handle pair via `chooseHandles()`: if the horizontal distance between source and target exceeds the vertical distance, the edge uses Left/Right handles; otherwise it uses Top/Bottom. This produces more orthogonal routing and avoids edges wrapping around nodes.

The `IranMap` component uses the same geographic projection as the nodes (`x = ((lng - 44) / 20) * 1600`, `y = ((40 - lat) / 13) * 1200`) and is anchored to the React Flow viewport via `useViewport()`, so the map pans and zooms with the topology.

## Immutable Updates

All node/edge updates produce new object references. The `useNetworkSimulation` hook derives decorated nodes/edges (with `onActivePath`, `distance`, `predecessor`, `visitOrder`) via `useMemo` at render time — these are never written back to the store, which prevents the infinite render loop that occurred in earlier versions.

Node metric updates from telemetry ticks flow through a registered callback: `useTelemetryStore.pushTelemetry()` calls `telemetryStoreCallbacks.onNodeMetrics()`, which maps over the topology store's nodes and returns new objects with spread operators.

## Routing Debounce

The `useNetworkSimulation` hook debounces routing re-computation by 300ms. Visual node positions update immediately (React Flow handles that internally), but the routing algorithm only re-runs after the user stops dragging. This prevents Dijkstra from running on every drag frame, which would cause UI jank on the 17-node topology.
