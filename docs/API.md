# API Reference

## GET /api/ripe-atlas

Probes one or more targets via the public RIPE Atlas measurement API.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `mode` | `probe` \| `sweep` \| `topology-sweep` | No | `probe` | Operation mode |
| `target` | string | Yes (probe) | — | Hostname or IP |
| `kind` | `http` \| `dns` \| `icmp` \| `traceroute` | No | `http` | Probe type |

### mode=probe

Single-target probe. Returns RTT, hops, packet loss for one target.

```bash
curl "http://localhost:3000/api/ripe-atlas?mode=probe&target=1.1.1.1&kind=icmp"
```

```json
{
  "measurementTarget": "1.1.1.1",
  "rttMs": 2.92,
  "hops": [{"ttl": 1, "host": "192.0.2.1", "rttMs": 0.45}],
  "packetLoss": 0,
  "statusCode": null,
  "sampleCount": 5
}
```

### mode=sweep

Probes 4 curated anycast DNS targets (1.1.1.1, 8.8.8.8, 9.9.9.9, OpenDNS). Returns aggregate sample + anomalies.

```bash
curl "http://localhost:3000/api/ripe-atlas?mode=sweep"
```

### mode=topology-sweep

Probes all 17 node targets concurrently (with fallbacks). Returns per-node outcomes + aggregate sample + anomalies. Used by `ApiTelemetryService` for live topology hydration.

```bash
curl "http://localhost:3000/api/ripe-atlas?mode=topology-sweep"
```

```json
{
  "ts": 1787797316470,
  "sample": {
    "avgLatency": 15.6,
    "p95Latency": 42.1,
    "throughput": 1137.6,
    "packetLoss": 0.29,
    "nodesOnline": 12,
    "nodeCount": 17,
    "telemetryScope": "public-targets",
    "throughputProvenance": "derived"
  },
  "anomalies": [...],
  "outcomes": [...],
  "nodeOutcomes": {
    "tehran-core": {"target": "1.1.1.1", "rttMs": 2.72, "succeeded": true},
    "mashhad-core": {"target": "8.8.8.8", "rttMs": 88.32, "succeeded": true},
    "shiraz-edge": {"target": "youtube.com", "succeeded": false, "error": "No recent results"}
  }
}
```

### Error Handling

| Status | Cause |
|--------|-------|
| 400 | Missing target, invalid mode/kind |
| 429 | Rate limited (30 requests/minute per IP) |
| 502 | RIPE Atlas unavailable, no measurement found, circuit breaker open |

### Caching

- Response cache: 5-second TTL on upstream RIPE Atlas URLs
- `ApiTelemetryService` sweep cache: 5-second TTL, shared across `getTopology`/`fetchTick`/`fetchNodeMetrics`
- Circuit breaker: 3 consecutive failures → 45-second open period

### Rate Limiting

30 requests per minute per client IP. Enforced via an in-memory `Map<string, RateLimitState>`.
