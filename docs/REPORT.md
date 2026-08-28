# Academic Report

## 1. Introduction

NetVis is a network telemetry visualization tool that models the Iranian national network as a 17-node weighted graph. The project serves two purposes: it provides a pedagogical platform for demonstrating shortest-path algorithms on a realistic topology, and it integrates real internet measurements from RIPE Atlas to bridge the gap between theoretical routing models and operational network conditions.

The system runs five routing algorithms — Dijkstra, Bellman-Ford, A\*, Yen's K-Shortest, and ECMP — on a latency-weighted graph. Two of these (Dijkstra, Bellman-Ford) produce full step-by-step execution traces for academic inspection. The remaining three produce final path results with performance summaries.

## 2. Topology Model

The network is modeled as an undirected weighted graph G = (V, E) where V = 17 nodes and E = 22 edges. Each node has a type (router, middlebox, edge-server, client), a geographic coordinate (lat/lng), and an operational status. Each edge has a weight (latency in milliseconds), bandwidth, utilization, packet loss, and a protocol assignment (BGP, OSPF, Static).

Nodes are positioned on the canvas via a linear geographic projection:

```
x = ((longitude - 44°) / 20°) × 1600 px
y = ((40° - latitude) / 13°) × 1200 px
```

This maps the Iranian bounding box onto a 1600×1200 canvas. The same projection is used for the Iran GeoJSON background, ensuring alignment between the map and the topology.

## 3. Routing Algorithms

### Dijkstra

Standard single-source shortest-path algorithm with non-negative edge weights. Uses an array-based priority queue with linear scan — O(V²) overall, which is adequate for V=17 (runtime ~0.5 ms). The implementation records every selection and relaxation step, producing a trace of approximately 47 steps for the default topology.

### Bellman-Ford

Performs |V|-1 relaxation passes over all edges. Supports negative edge weights and detects negative-weight cycles with one additional pass. Early termination kicks in when a pass produces no improvements — typically after 4-5 passes on the default topology (runtime ~0.7 ms).

A "Negative Cycle Demo" button temporarily sets the Tehran ↔ Isfahan edge weight to -3 ms and switches to Bellman-Ford, exercising the cycle detection on the live graph. The algorithm correctly identifies the cycle and displays a warning.

### A\*

Uses the haversine great-circle distance between node geo-coordinates as a heuristic, divided by 200 (approximate fiber propagation speed in km/ms). The heuristic is admissible — straight-line geographic distance is a lower bound on actual network latency. A\* exits early when the target node is reached, making it faster than Dijkstra for point-to-point queries.

### Yen's K-Shortest (K=3)

Finds the three shortest loopless paths from source to target. The algorithm works by iteratively removing edges from previously found paths and computing spur paths via Dijkstra. The primary path is highlighted solid on the canvas; alternative paths are included in the active path set. This is useful for resilience analysis — network operators can see backup paths if the primary route fails.

### ECMP

Discovers all equal-cost shortest paths by first running Dijkstra to find the shortest cost, then performing a DFS from source to target, collecting all paths whose total cost equals the shortest. All equal-cost paths are highlighted simultaneously. This models the behavior of modern routing protocols that distribute traffic across multiple paths of equal cost.

## 4. Telemetry Simulation

Demo mode uses a mulberry32 PRNG seeded with `0xc0ffee`. The same seed always produces the same sequence of telemetry values, which is critical for academic reproducibility. The simulator applies a sinusoidal drift model (±15% baseline wander) with random spikes (8% probability for latency, 5% for packet loss). Per-node metrics include CPU load, memory load, and packet loss, with middleboxes receiving a +15% CPU overhead to model DPI/NAT processing.

## 5. Live API Integration

Live API mode fetches real measurements from the public RIPE Atlas API. The `/api/ripe-atlas?mode=topology-sweep` endpoint probes all 17 node targets concurrently. Each node maps to a real target — core routers use ICMP to anycast DNS (1.1.1.1, 8.8.8.8, 9.9.9.9, OpenDNS), edge servers use HTTP to CDN domains (cloudflare.com, google.com, youtube.com), and client pools use a mix of ICMP and HTTP.

The `ApiTelemetryService` overlays real RTT/loss/status onto the static topology. Nodes whose probes succeeded get `online` or `degraded` status (degraded if RTT > 100 ms). Nodes whose probes failed get `offline` status. Edge latencies are derived from the average of endpoint RTTs. A circuit breaker opens after 3 consecutive failures for 45 seconds.

## 6. Results

### Algorithm Performance (17 nodes, 23 edges)

| Algorithm | Mean runtime | Steps/Paths |
|-----------|-------------|-------------|
| Dijkstra | 0.47 ms | ~47 steps |
| Bellman-Ford | 0.72 ms | ~38 steps (early termination) |
| A\* | 0.10 ms | 1 path |
| Yen's K-Shortest | 1.50 ms | 3 paths |
| ECMP | 0.40 ms | 1 path (typical) |

### Live API Observations

Typical sweep results show 12/17 nodes online (71%) with an average latency of 15.6 ms. The 5 offline nodes correspond to targets where RIPE Atlas has no recent public measurement results — this is honest reporting of real network conditions, not a bug. HTTP probes to CDN domains (google.com, cloudflare.com) sometimes fail because RIPE Atlas public HTTP measurements are less consistently available than ICMP ping measurements.

## 7. Limitations

1. RIPE Atlas public measurement availability varies by target and time. Not all 17 mapped targets have active public measurements on any given day.
2. The throughput metric is derived (1200 − avgLatency × 4), not measured. This is labeled in the UI as "Synthetic Throughput" with a "derived" provenance badge.
3. The demo simulator's drift model (±15%) underestimates real network variance (±300%).
4. The topology models only the Iranian national network. Multi-region routing studies would require additional nodes.

## 8. Conclusion

NetVis demonstrates that shortest-path algorithms can be visualized effectively on a realistic national topology with both simulated and real measurement data. The dual-mode architecture enables direct comparison between deterministic simulation and live network conditions, revealing that academic models significantly underestimate the variability and failure rate of real internet infrastructure.
