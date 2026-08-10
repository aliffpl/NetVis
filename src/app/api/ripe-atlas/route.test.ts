import assert from "node:assert/strict";
import { test } from "vitest";

import { selectMeasurementCandidate } from "./measurementSelection.ts";
import { aggregatePacketLoss, parseAtlasResult } from "./resultParser.ts";
import { shareInFlightRequest } from "../../../services/telemetry/inFlightRequest.ts";
import { routingTopologyRevision } from "../../../hooks/routingTopologyRevision.ts";
import type { NetVisEdge, NetVisNode } from "../../../types/index.ts";
import { pathEdgeIds, reconstructPath, runBellmanFord, runDijkstra } from "../../../engine/routingAlgorithms.ts";
import { applyTopologyCountFallback } from "../../../hooks/telemetrySampleFallback.ts";
import { canApplyTelemetryUpdate } from "../../../hooks/telemetryRequestGuard.ts";
import { consumeRateLimit, parseProbeKind, parseProbeMode, RATE_LIMIT_MAX_REQUESTS, validTarget } from "./routeSecurity.ts";
import { nearestRankPercentile } from "./percentile.ts";
import { geometryToSvgPath, validateGeoJson } from "../../../components/canvas/geoJsonPaths.ts";

const now = 1_700_000_000;

const sample = {
  ts: now, avgLatency: 10, p95Latency: 15, throughput: 100,
  packetLoss: 0, anomalyCount: 0, nodesOnline: 0, nodeCount: 0,
};

test("selects the most recent eligible public measurement", () => {
  const selected = selectMeasurementCandidate([
    {
      id: 1,
      target: "example.com",
      is_public: true,
      status: { id: 2 },
      start_time: now - 500,
      results: [{ timestamp: now - 400, rt: 20 }],
    },
    {
      id: 2,
      target: "example.com",
      is_public: true,
      status: { id: 4 },
      results: [{ timestamp: now - 30, rt: 10 }],
    },
    {
      id: 3,
      target: "example.com",
      is_public: false,
      status: { id: 2 },
      results: [{ timestamp: now - 1, rt: 1 }],
    },
  ], now);

  assert.equal(selected?.id, 2);
  assert.deepEqual(selected?.results, [{ timestamp: now - 30, rt: 10 }]);
});

test("rejects stopped measurements without valid results in the requested window", () => {
  const selected = selectMeasurementCandidate([
    {
      id: 1,
      target: "example.com",
      is_public: true,
      status: { id: 4 },
      results: [{ timestamp: now - 601, rt: 20 }],
    },
    {
      id: 2,
      target: "example.com",
      is_public: true,
      status: { id: 4 },
      results: [{ timestamp: "not-a-timestamp", rt: 10 }],
    },
  ], now);

  assert.equal(selected, null);
});

test("allows a currently active public measurement", () => {
  const selected = selectMeasurementCandidate([
    {
      id: 7,
      target: "example.com",
      is_public: true,
      status: { id: 2 },
      start_time: now - 100,
      results: [],
    },
  ], now);

  assert.equal(selected?.id, 7);
});

test("parses a replied ping using sent and received counts", () => {
  const outcome = parseAtlasResult({ sent: 3, rcvd: 3, avg: 0, min: 0, max: 0, lost: 0 }, "icmp", "1.1.1.1");

  assert.equal(outcome.succeeded, true);
  assert.equal(outcome.rttMs, 0);
  assert.equal(outcome.packetLoss, 0);
});

test("does not treat an unanswered ping sentinel as a valid RTT", () => {
  const outcome = parseAtlasResult({ sent: 3, rcvd: 0, avg: -1, min: -1, max: -1, lost: 3 }, "icmp", "1.1.1.1");

  assert.equal(outcome.succeeded, false);
  assert.equal(outcome.rttMs, undefined);
  assert.equal(outcome.packetLoss, 1);
});

test("calculates partial loss from sent and received counts", () => {
  const outcome = parseAtlasResult({ sent: 4, rcvd: 3, avg: 12 }, "icmp", "1.1.1.1");

  assert.equal(outcome.succeeded, true);
  assert.equal(outcome.packetLoss, 0.25);
  assert.equal(aggregatePacketLoss([outcome]), 0.25);
});

test("retains valid total loss and excludes it from unavailable probes", () => {
  const totalLoss = parseAtlasResult({ sent: 4, rcvd: 0, avg: -1 }, "icmp", "1.1.1.1");
  const unavailable = parseAtlasResult({ avg: -1 }, "icmp", "1.1.1.1");

  assert.equal(totalLoss.succeeded, false);
  assert.equal(totalLoss.rttMs, undefined);
  assert.equal(totalLoss.packetLoss, 1);
  assert.equal(aggregatePacketLoss([totalLoss, unavailable]), 1);
});

test("leaves loss unavailable when packet counts are missing", () => {
  const outcome = parseAtlasResult({ avg: -1, lost: -1 }, "icmp", "1.1.1.1");

  assert.equal(outcome.succeeded, false);
  assert.equal(outcome.packetLoss, undefined);
  assert.equal(aggregatePacketLoss([outcome]), 0);
});

test("parses the measured HTTP status code from the RIPE Atlas result schema", () => {
  const outcome = parseAtlasResult({ avg: 24, result: { http_code: 503 } }, "http", "example.com");

  assert.equal(outcome.succeeded, true);
  assert.equal(outcome.statusCode, 503);
});

test("leaves HTTP status unavailable when the result does not provide one", () => {
  const outcome = parseAtlasResult({ avg: 24, result: {} }, "http", "example.com");

  assert.equal(outcome.statusCode, undefined);
});

test("rejects invalid HTTP status codes", () => {
  const nonInteger = parseAtlasResult({ avg: 24, result: { http_code: 200.5 } }, "http", "example.com");
  const outOfRange = parseAtlasResult({ avg: 24, result: { http_code: 99 } }, "http", "example.com");

  assert.equal(nonInteger.statusCode, undefined);
  assert.equal(outOfRange.statusCode, undefined);
});

test("keeps traceroute samples unavailable when every hop lacks a valid RTT", () => {
  const outcome = parseAtlasResult({ result: [{ hop: 1, from: "*", rtt: -1 }, { hop: 2, from: "*" }] }, "traceroute", "8.8.8.8");

  assert.equal(outcome.succeeded, false);
  assert.equal(outcome.rttMs, undefined);
  assert.deepEqual(outcome.hops, []);
});

test("shares one upstream request between concurrent refresh callers", async () => {
  const state = { promise: null as Promise<string> | null };
  let upstreamCalls = 0;
  let releaseRequest!: (value: string) => void;
  const upstream = () => {
    upstreamCalls++;
    return new Promise<string>((resolve) => { releaseRequest = resolve; });
  };

  const first = shareInFlightRequest(state, upstream);
  const second = shareInFlightRequest(state, upstream);
  assert.equal(first, second);
  assert.equal(upstreamCalls, 1);

  releaseRequest("sweep");
  assert.equal(await first, "sweep");
  assert.equal(state.promise, null);
});

test("clears a failed in-flight request so the next caller can retry", async () => {
  const state = { promise: null as Promise<string> | null };
  let upstreamCalls = 0;
  const upstream = async () => {
    upstreamCalls++;
    throw new Error("upstream failed");
  };

  await assert.rejects(shareInFlightRequest(state, upstream), /upstream failed/);
  assert.equal(state.promise, null);
  await assert.rejects(shareInFlightRequest(state, upstream), /upstream failed/);
  assert.equal(upstreamCalls, 2);
});

test("changes routing revision when an edge weight changes without changing edge count", () => {
  const nodes: NetVisNode[] = [
    { id: "a", type: "router", position: { x: 0, y: 0 }, data: { label: "A", type: "router", status: "online", region: "test" } },
    { id: "b", type: "router", position: { x: 0, y: 0 }, data: { label: "B", type: "router", status: "online", region: "test" } },
  ];
  const edges: NetVisEdge[] = [
    { id: "ab", source: "a", target: "b", data: { latency: 10, bandwidth: 100, loss: 0, utilization: 0.1, status: "healthy" } },
  ];
  const original = routingTopologyRevision(nodes, edges);
  const updated: NetVisEdge[] = [{
    ...edges[0],
    data: { latency: 25, bandwidth: 100, loss: 0, utilization: 0.1, status: "healthy" },
  }];

  assert.notEqual(updated, original);
});

test("Bellman-Ford detects a reachable negative-weight cycle", () => {
  const nodes: NetVisNode[] = [
    { id: "a", type: "router", position: { x: 0, y: 0 }, data: { label: "A", type: "router", status: "online", region: "test" } },
    { id: "b", type: "router", position: { x: 0, y: 0 }, data: { label: "B", type: "router", status: "online", region: "test" } },
  ];
  const edges: NetVisEdge[] = [{
    id: "negative-ab", source: "a", target: "b",
    data: { latency: -5, bandwidth: 100, loss: 0, utilization: 0.1, status: "healthy" },
  }];

  const result = runBellmanFord(nodes, edges, "a");

  assert.equal(result.hasNegativeCycle, true);
});

test("Dijkstra rejects negative edge weights with a clear error", () => {
  const nodes: NetVisNode[] = [
    { id: "a", type: "router", position: { x: 0, y: 0 }, data: { label: "A", type: "router", status: "online", region: "test" } },
    { id: "b", type: "router", position: { x: 0, y: 0 }, data: { label: "B", type: "router", status: "online", region: "test" } },
  ];
  const edges: NetVisEdge[] = [{
    id: "negative-ab", source: "a", target: "b",
    data: { latency: -5, bandwidth: 100, loss: 0, utilization: 0.1, status: "healthy" },
  }];

  assert.throws(() => runDijkstra(nodes, edges, "a"), /Dijkstra cannot run with negative edge weight on negative-ab/);
});

test("does not traverse an explicitly one-way edge backward", () => {
  const nodes: NetVisNode[] = [
    { id: "a", type: "router", position: { x: 0, y: 0 }, data: { label: "A", type: "router", status: "online", region: "test" } },
    { id: "b", type: "router", position: { x: 0, y: 0 }, data: { label: "B", type: "router", status: "online", region: "test" } },
  ];
  const edges: NetVisEdge[] = [{
    id: "one-way-ab", source: "a", target: "b",
    data: { latency: 5, bandwidth: 100, loss: 0, utilization: 0.1, status: "healthy", directed: true },
  }];

  const forward = runDijkstra(nodes, edges, "a");
  const reverse = runDijkstra(nodes, edges, "b");

  assert.equal(forward.distances.b, 5);
  assert.equal(reverse.distances.a, Infinity);
  assert.deepEqual(pathEdgeIds(edges, ["b", "a"]), []);
  assert.deepEqual(pathEdgeIds(edges, ["a", "b"]), ["one-way-ab"]);
});

test("reconstructPath returns null for an unreachable target", () => {
  assert.equal(reconstructPath({ a: null, b: null }, "a", "b"), null);
});

test("Bellman-Ford detects a reachable directed negative cycle", () => {
  const nodes: NetVisNode[] = [
    { id: "a", type: "router", position: { x: 0, y: 0 }, data: { label: "A", type: "router", status: "online", region: "test" } },
    { id: "b", type: "router", position: { x: 0, y: 0 }, data: { label: "B", type: "router", status: "online", region: "test" } },
    { id: "c", type: "router", position: { x: 0, y: 0 }, data: { label: "C", type: "router", status: "online", region: "test" } },
  ];
  const edgeData = { bandwidth: 100, loss: 0, utilization: 0.1, status: "healthy" as const, directed: true };
  const edges: NetVisEdge[] = [
    { id: "ab", source: "a", target: "b", data: { ...edgeData, latency: -4 } },
    { id: "bc", source: "b", target: "c", data: { ...edgeData, latency: 1 } },
    { id: "ca", source: "c", target: "a", data: { ...edgeData, latency: 1 } },
  ];

  assert.equal(runBellmanFord(nodes, edges, "a").hasNegativeCycle, true);
});

test("preserves zero telemetry counts instead of applying topology fallbacks", () => {
  const result = applyTopologyCountFallback(sample, 7, 19);

  assert.equal(result.nodesOnline, 0);
  assert.equal(result.nodeCount, 0);
});

test("preserves positive telemetry counts", () => {
  const result = applyTopologyCountFallback({ ...sample, nodesOnline: 3, nodeCount: 8 }, 7, 19);

  assert.equal(result.nodesOnline, 3);
  assert.equal(result.nodeCount, 8);
});

test("uses topology fallbacks only when telemetry counts are absent", () => {
  const incomplete = { ...sample, nodesOnline: undefined, nodeCount: undefined } as unknown as typeof sample;
  const result = applyTopologyCountFallback(incomplete, 7, 19);

  assert.equal(result.nodesOnline, 7);
  assert.equal(result.nodeCount, 19);
});

test("renders polygon holes as preserved even-odd subpaths", () => {
  const geometry = {
    type: "Polygon" as const,
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 0]],
      [[2, 2], [8, 2], [8, 8], [2, 2]],
    ],
  };

  const path = geometryToSvgPath(geometry, (lng, lat) => [lng, lat]);

  assert.equal((path.match(/M /g) ?? []).length, 2);
  assert.equal((path.match(/ Z/g) ?? []).length, 2);
});

test("renders every part of a multipolygon", () => {
  const geometry = {
    type: "MultiPolygon" as const,
    coordinates: [
      [[[0, 0], [1, 0], [1, 1], [0, 0]]],
      [[[10, 10], [11, 10], [11, 11], [10, 10]]],
    ],
  };

  const path = geometryToSvgPath(geometry, (lng, lat) => [lng, lat]);

  assert.equal((path.match(/M /g) ?? []).length, 2);
});

test("rejects malformed GeoJSON instead of rendering partial geometry", () => {
  assert.equal(validateGeoJson({ type: "FeatureCollection", features: [] }), null);
  assert.equal(validateGeoJson({ type: "FeatureCollection", features: [{ type: "Feature" }] }), null);
});

test("ignores a slow old request after the telemetry source changes", async () => {
  const controller = new AbortController();
  let resolveOldRequest!: () => void;
  const oldRequest = new Promise<void>((resolve) => { resolveOldRequest = resolve; });
  let storeWrites = 0;
  const oldGeneration = 1;
  const activeGeneration = 2;

  controller.abort();
  resolveOldRequest();
  await oldRequest;
  if (canApplyTelemetryUpdate(oldGeneration, activeGeneration, controller.signal, "api", "demo")) storeWrites++;

  assert.equal(storeWrites, 0);
});

test("accepts bounded hostnames and IP addresses but rejects unsafe targets", () => {
  assert.equal(validTarget("example.com"), true);
  assert.equal(validTarget("2001:db8::1"), true);
  assert.equal(validTarget("bad target.example"), false);
  assert.equal(validTarget(`${"a".repeat(64)}.example`), false);
});

test("rate-limits a client within the configured window", () => {
  const limits = new Map<string, { startedAt: number; count: number }>();
  const now = 1_700_000_000_000;

  for (let request = 0; request < RATE_LIMIT_MAX_REQUESTS; request++) {
    assert.equal(consumeRateLimit(limits, "client", now).allowed, true);
  }
  const limited = consumeRateLimit(limits, "client", now);

  assert.equal(limited.allowed, false);
  assert.equal(limited.retryAfterSeconds > 0, true);
  assert.equal(consumeRateLimit(limits, "client", now + 60_000).allowed, true);
});

test("rejects unknown request modes at the API boundary", () => {
  assert.equal(parseProbeMode("probe"), "probe");
  assert.equal(parseProbeMode("sweep"), "sweep");
  assert.equal(parseProbeMode("stream"), null);
});

test("rejects unknown request kinds at the API boundary", () => {
  assert.equal(parseProbeKind("icmp"), "icmp");
  assert.equal(parseProbeKind("bogus"), null);
  assert.equal(parseProbeKind("http\u0000"), null);
});

test("returns no percentile for an empty sample", () => {
  assert.equal(nearestRankPercentile([], 0.95), undefined);
});

test("returns the only value for a one-item sample", () => {
  assert.equal(nearestRankPercentile([42], 0.95), 42);
});

test("uses the nearest-rank percentile for multiple samples", () => {
  assert.equal(nearestRankPercentile([40, 10, 30, 20], 0.95), 40);
  assert.equal(nearestRankPercentile([10, Number.NaN, 20], 0.95), 20);
});

