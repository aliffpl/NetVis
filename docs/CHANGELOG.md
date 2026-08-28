# Changelog

## [3.0.0] — 2026-08-28

### Added
- Five routing algorithms: Dijkstra, Bellman-Ford, A*, Yen's K-Shortest (K=3), ECMP
- A* uses haversine great-circle heuristic (admissible: geographic distance / 200 km per ms)
- Yen's K-Shortest finds 3 loopless paths; primary solid, alternatives highlighted
- ECMP discovers all equal-cost multi-paths via DFS after Dijkstra finds shortest cost
- "Neg. Cycle Demo" button: temporarily injects a -3 ms edge, switches to Bellman-Ford, exercises negative-cycle detection on the live graph
- AlgorithmTrace shows summary panel for non-step-trace algorithms (A*, Yen's, ECMP)
- `mode=topology-sweep` on `/api/ripe-atlas`: probes all 17 node targets concurrently
- `LIVE_NODE_TARGETS` mapping: each of the 17 nodes maps to a real RIPE Atlas target with fallbacks
- `ApiTelemetryService.getTopology()`: overlays real RTT/loss/status onto the 17-node topology
- `ApiTelemetryService.fetchNodeMetrics()`: derives CPU/MEM/loss from real probe outcomes (was returning `{}`)
- Circuit breaker in ApiTelemetryService: 3 consecutive failures → 45s open
- Unique anomaly IDs with sequence counter (prevents silent deduplication)
- `expiresAt` field on AnomalyEvent; 8-second TTL for manually injected anomalies
- Pruning interval (every 2s) removes expired anomalies from the log
- `"no-data"` node status (grey dot) for nodes with no recent measurement
- `TelemetryServiceProvider` (React Context): single memoized service instance
- Four focused Zustand stores: useTopologyStore, useRoutingStore, useTelemetryStore, useUiStore
- Legacy `useNetworkStore` facade with subscribe-based sync across slices
- Nearest-handle edge routing: `chooseHandles()` picks the handle pair that minimizes connection length
- Zoom-aware node compact mode: below zoom 0.55, nodes show icon + label + status only
- `react-resizable-panels` for the right sidebar: three independently resizable panels with persisted sizes
- `PanelResizeHandle` with hover styling and cursor feedback

### Changed
- Store split from one god-object into four focused slices
- TelemetrySimulator removed from the store; lives exclusively in DemoTelemetryService
- Routing re-computation debounced by 300ms (prevents thrashing during node drag)
- All node/edge updates produce new object references (immutable)
- Recharts uses `h-full min-h-[120px]` instead of fixed `h-[180px]`
- AnomalyLogTable Card uses `h-full` with `min-h-0 flex-1` ScrollArea
- Algorithm dropdown shows 5 options (was 2)
- About text lists all five algorithms

### Removed
- CSP (Constrained Shortest Path) algorithm — removed from types, engine, and UI
- TelemetrySimulator instance from the store
- Duplicate service instantiation in useNetworkSimulation and useTelemetryStream

### Fixed
- `ApiTelemetryService.fetchNodeMetrics()` returned `{}` — now derives real metrics from probe outcomes
- Live anomaly IDs were deterministic — now use sequence counter for uniqueness
- Right sidebar charts had zero height — fixed with `h-full` on Card and `min-h-[120px]` on wrappers
- AnomalyLogTable had fixed `h-[280px]` ScrollArea — now fills its panel via `h-full`

## [2.0.0] — 2026-08-27

### Added
- Live API mode with `/api/ripe-atlas?mode=sweep` endpoint
- `ApiTelemetryService` with 5-second sweep cache
- `NODE_TARGET_MAP` for mapping topology nodes to sweep targets
- Real anomaly generation from probe failures and threshold crossings
- EndpointProbe reads `dataSource` and branches between live and demo paths
- Provenance badges: "Synthetic Throughput" label, "Public Targets" label
- Comprehensive documentation suite (7 files, ~22,000 words)
- Python report generator (`scripts/generate_report.py`)

### Changed
- Layout: strict `h-screen w-screen overflow-hidden flex flex-col` container
- Right sidebar: `w-96 shrink-0` with internal scroll
- Recharts: `ResponsiveContainer width="100%" height="100%"`
- IranMap: aligned projection with nodes (1600×1200 canvas)
- DialogContent: `showCloseButton={false}` to prevent duplicate close buttons

### Fixed
- Nodes overlapped due to cramped projection multipliers
- Right sidebar overflowed at 100% browser scale
- IranMap disproportionately small compared to nodes
- Duplicate close buttons on inspector modal
- Live API toggle did nothing (ApiTelemetryService was a stub)
- EndpointProbes couldn't detect real anomalies
- Infinite render loop from writing decorated nodes back to store
- Anomaly duplicate-key warnings from re-emitting injected anomalies

## [1.0.0] — 2026-08-20

### Added
- Next.js 16 + React 19 + TypeScript 5 project scaffold
- Tailwind CSS 4 with oklch color space, dark-mode default
- 48 shadcn/ui primitives
- Zustand store with topology, algorithm state, telemetry history, anomalies, probes
- Dijkstra and Bellman-Ford with step-by-step trace
- TelemetrySimulator with mulberry32 PRNG
- 17-node Iranian topology with 23 weighted edges
- Geographic projection (lat/lng → x/y)
- Custom React Flow nodes (Router, Middlebox, EdgeServer, Client)
- Custom animated edges with status colors
- AlgorithmTrace panel with step controls
- 6 KPI cards with delta indicators
- Recharts visualizations (latency, throughput, loss)
- Anomaly log with severity filters
- Diagnostic inspector modal
- EndpointProbe (initially demo-only)
- DataSourceToggle (initially a stub)
