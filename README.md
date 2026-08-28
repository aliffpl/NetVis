
# NetVis

**Network Telemetry & Anomaly Visualizer**

NetVis models the Iranian national backbone as a fixed 17-node weighted graph. It runs five shortest-path algorithms, streams telemetry in two modes (deterministic simulation and live RIPE Atlas measurements), and renders the topology on an interactive canvas aligned with a geographic outline of Iran.

Demo mode produces reproducible results via a seeded PRNG. Live mode maps real public RIPE Atlas probe outcomes onto the same topology. No API key is required.

---

## Quick Start

```bash
git clone https://github.com/your-username/netvis.git
cd netvis
bun install          # or: npm install
bun run dev          # → http://localhost:3000
```

Requires Node.js 20+ or Bun 1.x.  
Live API mode uses public RIPE Atlas endpoints — no environment variables needed.

---

## What It Does

### Topology

| Layer            | Count | Nodes                                                                 |
|------------------|-------|-----------------------------------------------------------------------|
| Core routers     | 6     | Tehran, Mashhad, Isfahan, Shiraz, Tabriz, Ahvaz                       |
| Middleboxes      | 4     | DPI, Firewall, NAT, Load Balancer                                     |
| Edge / CDN       | 3     | Tehran Edge, Isfahan DC, Shiraz Edge                                  |
| Client pools     | 4     | Tehran, Mashhad, Tabriz, Shiraz Clients                               |

23 weighted edges carry latency, bandwidth, loss and protocol annotations (BGP / OSPF / Static). Nodes are placed by geographic projection; an Iran GeoJSON outline shares the same projection and stays locked to the React Flow viewport.

### Routing Algorithms

| Algorithm            | Purpose                                                   |
|----------------------|-----------------------------------------------------------|
| **Dijkstra**         | Standard shortest-path with non-negative weights          |
| **Bellman-Ford**     | Negative weights + negative-cycle detection               |
| **A\***              | Point-to-point search with great-circle heuristic         |
| **Yen's K-Shortest** | K=3 loopless paths for resilience analysis                |
| **ECMP**             | All equal-cost multi-paths for load-balancing studies     |

A temporary **Neg. Cycle Demo** control injects a negative-weight edge, switches to Bellman-Ford, then restores the original topology.

### Telemetry

| Mode     | Source                          | Behaviour                                                                 |
|----------|---------------------------------|---------------------------------------------------------------------------|
| Demo     | mulberry32 PRNG (`0xc0ffee`)    | Deterministic, reproducible sequences                                     |
| Live API | RIPE Atlas `topology-sweep`     | Concurrent probes of all 17 mapped targets; real RTT / loss / status      |

- Nodes without recent measurements are marked `no-data` — values are never fabricated  
- 5 s client-side sweep cache  
- Circuit breaker: 3 consecutive failures → 45 s open  
- Unique anomaly IDs + 8 s TTL on manually injected anomalies  

### Interface

- Nodes collapse to a compact representation below zoom **0.55**
- Edges attach to the geometrically nearest of the four handles (top / bottom / left / right)
- Right sidebar uses `react-resizable-panels` (Metrics · Charts · Anomaly Log) with persisted sizes
- Algorithm step navigator, endpoint probe panel, anomaly injection controls, data-source toggle

---

## Tech Stack

| Layer        | Choice                                      |
|--------------|---------------------------------------------|
| Framework    | Next.js 16 (App Router) · React 19 · TypeScript 5 |
| State        | Zustand (4 focused stores + thin legacy facade) |
| Canvas       | `@xyflow/react` v12 — custom nodes & edges  |
| Charts       | Recharts                                    |
| Styling      | Tailwind CSS 4 · shadcn/ui · oklch          |
| Layout       | `react-resizable-panels`                    |
| Measurements | RIPE Atlas v2 (public endpoints only)       |

---

## Architecture

```
Browser
├── Header          algorithm / source / target · data-source toggle · transport
├── Left Sidebar    endpoint probe · anomaly injection
├── Canvas          React Flow · custom nodes/edges · Iran map · algorithm trace
└── Right Sidebar   resizable panels → metrics · charts · anomaly log
        │
        ▼
Zustand Stores
├── useTopologyStore    nodes · edges · React Flow handlers
├── useRoutingStore     algorithm · result · step cursor · active path
├── useTelemetryStore   status · history · metrics · anomalies
└── useUiStore          selection · probes
        │
        ▼
TelemetryServiceProvider
├── DemoTelemetryService    TelemetrySimulator (mulberry32)
└── ApiTelemetryService     /api/ripe-atlas?mode=topology-sweep
        │
        ▼
Next.js API Route  →  https://atlas.ripe.net/api/v2
```

Routing is recomputed with a **300 ms debounce**. Decorated nodes/edges (distance, `onActivePath`, visit order) are derived via `useMemo` and never written back to the store. The store never owns a simulator instance.

### Live Pipeline

1. `LIVE_NODE_TARGETS` maps each of the 17 node IDs to a primary target (+ optional fallbacks)  
2. `/api/ripe-atlas?mode=topology-sweep` probes all targets concurrently  
3. `ApiTelemetryService` overlays RTT, loss and status onto the corresponding nodes and adjacent edges  
4. Missing measurements → `no-data`

---

## API

```
GET /api/ripe-atlas
```

| Parameter | Values                                      | Default   |
|-----------|---------------------------------------------|-----------|
| `mode`    | `probe` · `sweep` · `topology-sweep`        | `probe`   |
| `target`  | hostname or IP                              | required for `probe` |
| `kind`    | `http` · `dns` · `icmp` · `traceroute`      | `http`    |

| Mode             | Behaviour                                              |
|------------------|--------------------------------------------------------|
| `probe`          | Single target                                          |
| `sweep`          | Four public anycast DNS targets (legacy aggregate)     |
| `topology-sweep` | All 17 mapped targets → `nodeOutcomes` + aggregate     |

- Rate limit: **30 req/min** per client IP (in-memory)  
- Upstream cache: **5 s**  
- Circuit breaker opens after three consecutive failures  

---

## Documentation

| Document | Content |
|----------|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, store split, data flow, React Flow integration |
| [REPORT.md](docs/REPORT.md)             | Academic report — methodology, algorithm analysis, results    |
| [CHANGELOG.md](docs/CHANGELOG.md)       | Version history and bug-fix trail                             |
| [PORTFOLIO.md](docs/PORTFOLIO.md)       | Feature walkthrough, technical highlights, lessons learned    |
| [API.md](docs/API.md)                   | Request/response schemas, examples                            |
| [EXAMINER_QA.md](docs/EXAMINER_QA.md)   | Examiner challenge questions and responses                    |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | Setup, code style, PR process                                 |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  Main layout
│   ├── layout.tsx                Root layout + TelemetryServiceProvider
│   ├── globals.css               Tailwind + theme
│   └── api/ripe-atlas/           Proxy route + helpers
├── components/
│   ├── canvas/                   Nodes, edges, IranMap, AlgorithmTrace, NetworkCanvas
│   ├── dashboard/                MetricsOverview, RealtimeCharts, AnomalyLogTable
│   ├── header/                   DataSourceToggle
│   ├── inspector/                EndpointProbe, PacketDetailsModal
│   ├── providers/                TelemetryServiceProviderBridge
│   └── ui/                       shadcn/ui primitives
├── engine/
│   ├── routingAlgorithms.ts      Dijkstra · Bellman-Ford · A* · Yen · ECMP
│   └── telemetrySimulator.ts     PRNG simulator + topology builder
├── hooks/                        useNetworkSimulation, useTelemetryStream, helpers
├── services/telemetry/           ITelemetryService, Demo, Api, liveNodeTargets, context
├── store/                        4 focused stores + legacy facade
├── types/index.ts                All TypeScript interfaces
└── lib/utils.ts                  cn() helper
```

---

## Design Notes

- The 17-node topology is fixed. Live mode only annotates existing nodes; it never invents new ones or fabricates latency values.
- Throughput is derived (`max(50, 1200 − avgLatency × 4)`) and labelled as such in the UI.
- Full step traces are retained for Dijkstra and Bellman-Ford. The three practical algorithms return a short summary and the final path set.
- Rate limiting is process-local. Multi-instance deployments need a shared store for a global budget.
- The geographic projection and the Iran GeoJSON share the same linear mapping — changing one without the other mis-aligns the map and the nodes.

---

## Known Limitations

1. Public RIPE Atlas coverage for the mapped targets is sparse and time-varying. A typical live sweep reports roughly 60–75 % of nodes with usable data.
2. The demo drift model (±15 %) understates real-world latency variance.
3. The in-memory rate limiter does not coordinate across serverless instances.
4. Bundle size is dominated by React Flow and Recharts; further code-splitting of the canvas and chart panels remains possible.

---

## License

MIT — see [LICENSE](LICENSE).
