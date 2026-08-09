import { NextRequest, NextResponse } from "next/server";
import {
  RESULT_WINDOW_SECONDS,
  type MeasurementCandidate,
  type SelectedMeasurement,
  selectMeasurementCandidate,
} from "./measurementSelection";
import { aggregatePacketLoss, parseAtlasResult, type AtlasResult, type ProbeKind, type ProbeOutcome } from "./resultParser";
import { nearestRankPercentile } from "./percentile";
import {
  consumeRateLimit, MAX_KIND_LENGTH, MAX_MODE_LENGTH, parseProbeKind, parseProbeMode,
  type RateLimitState, validTarget,
} from "./routeSecurity";
import { LIVE_NODE_TARGETS } from "@/services/telemetry/liveNodeTargets";

/**
 * /api/ripe-atlas
 *
 * Unified route that proxies to the public RIPE Atlas measurement API.
 *
 * Query params:
 *   - target: hostname or IP (required for mode=probe)
 *   - kind:   "http" | "dns" | "icmp" | "traceroute" (default "http")
 *   - mode:   "probe" (default) | "sweep" | "topology-sweep"
 *
 * mode=probe           → returns a single ProbeResult-like payload for one target.
 * mode=sweep           → runs a curated 4-target sweep (legacy).
 * mode=topology-sweep  → probes all 17 node targets (with fallbacks) and returns
 *                        a map nodeId → ProbeOutcome plus the aggregate sample.
 *                        Used by ApiTelemetryService for live topology hydration.
 */

const ATLAS_API = "https://atlas.ripe.net/api/v2";
const UPSTREAM_TIMEOUT_MS = 10_000;
const RESPONSE_CACHE_TTL_MS = 5_000;
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const rateLimits = new Map<string, RateLimitState>();

const SWEEP_TARGETS: ReadonlyArray<{ target: string; kind: ProbeKind; label: string }> = [
  { target: "1.1.1.1", kind: "icmp", label: "Cloudflare DNS" },
  { target: "8.8.8.8", kind: "icmp", label: "Google DNS" },
  { target: "9.9.9.9", kind: "icmp", label: "Quad9 DNS" },
  { target: "208.67.222.222", kind: "icmp", label: "OpenDNS" },
];

async function atlasJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const cached = responseCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) responseCache.delete(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`RIPE Atlas returned HTTP ${response.status}`);
    const value = await response.json();
    responseCache.set(url, { expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS, value });
    if (responseCache.size > 256) responseCache.delete(responseCache.keys().next().value as string);
    return value;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

function publicUpstreamError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "RIPE Atlas request timed out";
  return "RIPE Atlas service is temporarily unavailable";
}

function requestClientKey(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() || "unknown";
}

async function findMeasurement(target: string, kind: ProbeKind | undefined, signal?: AbortSignal): Promise<SelectedMeasurement | null> {
  try {
    const atlasType = kind === "traceroute" ? "traceroute" : kind === "dns" ? "dns" : kind === "http" ? "http" : "ping";
    const url = `${ATLAS_API}/measurements/?page_size=20&target=${encodeURIComponent(target)}&type=${atlasType}&status=2&is_public=true`;
    const data = await atlasJson(url, signal) as { results?: MeasurementCandidate[] };
    const active = (data.results ?? []).filter((item) => item.target?.toLowerCase() === target.toLowerCase());
    let discovered = active;
    if (discovered.length === 0) {
      const untyped = await atlasJson(
        `${ATLAS_API}/measurements/?page_size=50&target=${encodeURIComponent(target)}`,
        signal,
      ) as { results?: MeasurementCandidate[] };
      discovered = (untyped.results ?? [])
        .filter((item) => item.target?.toLowerCase() === target.toLowerCase())
        .sort((left, right) => Number(right.creation_time ?? 0) - Number(left.creation_time ?? 0))
        .slice(0, 8);
    }
    const byId = new Map<number, MeasurementCandidate>();
    for (const item of discovered.slice(0, 8)) byId.set(item.id, item);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const candidates = await Promise.all([...byId.values()].map(async (item) => ({
      ...item,
      results: await fetchMeasurementResults(item.id, nowSeconds, signal),
    })));
    return selectMeasurementCandidate(candidates, nowSeconds);
  } catch {
    return null;
  }
}

async function fetchMeasurementResults(measurementId: number, nowSeconds = Math.floor(Date.now() / 1000), signal?: AbortSignal): Promise<AtlasResult[]> {
  const start = nowSeconds - RESULT_WINDOW_SECONDS;
  const data = await atlasJson(`${ATLAS_API}/measurements/${measurementId}/results/?format=json&start=${start}`, signal);
  return Array.isArray(data) ? (data as AtlasResult[]) : [];
}

async function probeOne(target: string, kind: ProbeKind, signal?: AbortSignal): Promise<ProbeOutcome> {
  try {
    const measurement = await findMeasurement(target, kind, signal);
    if (!measurement) {
      return { target, kind, label: target, succeeded: false, error: `No public RIPE Atlas measurement is available for ${target} in the last 10 minutes` };
    }
    const results = measurement.results;
    if (!results.length) {
      return { target, kind, label: target, succeeded: false, error: "No recent results from RIPE Atlas" };
    }
    const parsed = results.map((r) => parseAtlasResult(r, kind, target));
    const usable = parsed.find((p) => p.succeeded) ?? parsed[0];
    return {
      ...usable,
      label: target,
      error: usable.succeeded ? usable.error : `No valid recent ${kind} result from RIPE Atlas`,
    };
  } catch (error) {
    return { target, kind, label: target, succeeded: false, error: publicUpstreamError(error) };
  }
}

async function runSweep(signal?: AbortSignal): Promise<{
  outcomes: ProbeOutcome[]; avgLatency: number; p95Latency: number;
  throughput: number; packetLoss: number; nodesOnline: number; nodeCount: number;
  validSampleCount: number; failureCount: number;
}> {
  const outcomes = await Promise.all(SWEEP_TARGETS.map((t) => probeOne(t.target, t.kind, signal)));
  const rtts = outcomes.filter((o) => o.rttMs !== undefined).map((o) => o.rttMs as number).sort((a, b) => a - b);
  const succeededCount = outcomes.filter((o) => o.succeeded).length;
  const total = outcomes.length;
  const lossRatio = aggregatePacketLoss(outcomes);
  const avgLatency = rtts.length ? rtts.reduce((s, v) => s + v, 0) / rtts.length : 0;
  const p95Latency = nearestRankPercentile(rtts, 0.95) ?? 0;
  const throughput = rtts.length ? Math.max(50, Math.min(1200, 1200 - avgLatency * 4)) : 0;
  return {
    outcomes, avgLatency, p95Latency, throughput, packetLoss: lossRatio,
    nodesOnline: succeededCount, nodeCount: total, validSampleCount: rtts.length, failureCount: total - succeededCount,
  };
}

function detectAnomalies(outcomes: ProbeOutcome[], avgLatency: number, packetLoss: number) {
  const anomalies: Array<{
    kind: string; severity: "info" | "warning" | "critical"; title: string; description: string;
    observedValue: number; expectedValue: number; target: string;
  }> = [];

  if (avgLatency > 80) {
    anomalies.push({
      kind: "high-latency", severity: "warning",
      title: "Live latency above SLA threshold",
      description: `RIPE Atlas sweep reports average RTT ${avgLatency.toFixed(1)} ms across ${outcomes.length} targets — exceeds 80 ms SLA baseline.`,
      observedValue: avgLatency, expectedValue: 80, target: "sweep",
    });
  }
  if (packetLoss > 0.1) {
    anomalies.push({
      kind: "packet-loss", severity: "critical",
      title: "Live packet-loss excursion",
      description: `${(packetLoss * 100).toFixed(1)}% of RIPE Atlas sweep probes failed — investigate upstream connectivity.`,
      observedValue: packetLoss, expectedValue: 0.02, target: "sweep",
    });
  }
  for (const o of outcomes) {
    if (!o.succeeded) {
      anomalies.push({
        kind: "node-down", severity: "warning",
        title: `Live probe failed: ${o.target}`,
        description: o.error ?? `RIPE Atlas reported no usable results for ${o.target} in the last 10 minutes.`,
        observedValue: 0, expectedValue: 1, target: o.target,
      });
    } else if (o.rttMs !== undefined && o.rttMs > 200) {
      anomalies.push({
        kind: "high-latency", severity: "warning",
        title: `Latency spike on ${o.target}`,
        description: `Probe to ${o.target} returned RTT ${o.rttMs.toFixed(1)} ms — exceeds 200 ms threshold.`,
        observedValue: o.rttMs, expectedValue: 200, target: o.target,
      });
    }
  }
  return anomalies;
}

/**
 * Probe a single target, falling back to alternate targets if the primary
 * has no recent data. Returns the first successful outcome, or the last
 * failure if all targets fail.
 */
async function probeWithFallback(
  targets: string[],
  kind: ProbeKind,
  signal?: AbortSignal,
): Promise<ProbeOutcome> {
  let lastOutcome: ProbeOutcome | null = null;
  for (const target of targets) {
    const outcome = await probeOne(target, kind, signal);
    if (outcome.succeeded) return outcome;
    lastOutcome = outcome;
  }
  return lastOutcome ?? { target: targets[0] ?? "unknown", kind, label: targets[0] ?? "unknown", succeeded: false, error: "No targets available" };
}

/**
 * Run a topology sweep: probe all 17 node targets concurrently and return
 * a map of nodeId → ProbeOutcome plus the aggregate telemetry sample.
 *
 * Each node's target list includes fallbacks, so if the primary target has
 * no recent RIPE Atlas data, we try the fallbacks before marking the node
 * as "no recent data".
 */
async function runTopologySweep(signal?: AbortSignal): Promise<{
  nodeOutcomes: Record<string, ProbeOutcome>;
  outcomes: ProbeOutcome[];
  avgLatency: number;
  p95Latency: number;
  throughput: number;
  packetLoss: number;
  nodesOnline: number;
  nodeCount: number;
  validSampleCount: number;
  failureCount: number;
}> {
  const nodeEntries = Object.entries(LIVE_NODE_TARGETS);
  const results = await Promise.all(
    nodeEntries.map(async ([nodeId, nodeTarget]) => {
      const targets = [nodeTarget.primary, ...(nodeTarget.fallbacks ?? [])];
      const outcome = await probeWithFallback(targets, nodeTarget.kind, signal);
      return [nodeId, outcome] as const;
    }),
  );

  const nodeOutcomes: Record<string, ProbeOutcome> = {};
  const outcomes: ProbeOutcome[] = [];
  for (const [nodeId, outcome] of results) {
    nodeOutcomes[nodeId] = outcome;
    outcomes.push(outcome);
  }

  const rtts = outcomes.filter((o) => o.rttMs !== undefined).map((o) => o.rttMs as number).sort((a, b) => a - b);
  const succeededCount = outcomes.filter((o) => o.succeeded).length;
  const total = outcomes.length;
  const lossRatio = aggregatePacketLoss(outcomes);
  const avgLatency = rtts.length ? rtts.reduce((s, v) => s + v, 0) / rtts.length : 0;
  const p95Latency = nearestRankPercentile(rtts, 0.95) ?? 0;
  const throughput = rtts.length ? Math.max(50, Math.min(1200, 1200 - avgLatency * 4)) : 0;

  return {
    nodeOutcomes,
    outcomes,
    avgLatency,
    p95Latency,
    throughput,
    packetLoss: lossRatio,
    nodesOnline: succeededCount,
    nodeCount: total,
    validSampleCount: rtts.length,
    failureCount: total - succeededCount,
  };
}

export async function GET(request: NextRequest) {
  const limit = consumeRateLimit(rateLimits, requestClientKey(request));
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests; please retry later" }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }
  const params = request.nextUrl.searchParams;
  const modeParam = params.get("mode") ?? "probe";
  const mode = modeParam.length <= MAX_MODE_LENGTH ? parseProbeMode(modeParam) : null;
  if (!mode) {
    return NextResponse.json({ error: "mode must be probe, sweep, or topology-sweep" }, { status: 400 });
  }

  if (mode === "topology-sweep") {
    try {
      const sweep = await runTopologySweep(request.signal);
      const anomalies = detectAnomalies(sweep.outcomes, sweep.avgLatency, sweep.packetLoss);
      return NextResponse.json({
        ts: Date.now(),
        sample: {
          ts: Date.now(),
          avgLatency: sweep.avgLatency,
          p95Latency: sweep.p95Latency,
          throughput: sweep.throughput,
          packetLoss: sweep.packetLoss,
          anomalyCount: anomalies.length,
          nodesOnline: sweep.nodesOnline,
          nodeCount: sweep.nodeCount,
          validSampleCount: sweep.validSampleCount,
          failureCount: sweep.failureCount,
          telemetryScope: "public-targets",
          throughputProvenance: "derived",
        },
        anomalies,
        outcomes: sweep.outcomes,
        nodeOutcomes: sweep.nodeOutcomes,
      });
    } catch (error) {
      return NextResponse.json({ error: publicUpstreamError(error) }, { status: 502 });
    }
  }

  if (mode === "sweep") {
    try {
      const sweep = await runSweep(request.signal);
      const anomalies = detectAnomalies(sweep.outcomes, sweep.avgLatency, sweep.packetLoss);
      return NextResponse.json({
        ts: Date.now(),
        sample: {
          ts: Date.now(), avgLatency: sweep.avgLatency, p95Latency: sweep.p95Latency,
          throughput: sweep.throughput, packetLoss: sweep.packetLoss,
          anomalyCount: anomalies.length, nodesOnline: sweep.nodesOnline, nodeCount: sweep.nodeCount,
          validSampleCount: sweep.validSampleCount, failureCount: sweep.failureCount,
        },
        anomalies,
        outcomes: sweep.outcomes,
      });
    } catch (error) {
      return NextResponse.json({ error: publicUpstreamError(error) }, { status: 502 });
    }
  }

  const target = params.get("target")?.trim();
  const kindParam = params.get("kind") ?? "http";
  const kind = kindParam.length <= MAX_KIND_LENGTH ? parseProbeKind(kindParam) : null;
  if (!kind) {
    return NextResponse.json({ error: "kind must be http, dns, icmp, or traceroute" }, { status: 400 });
  }
  if (!target) return NextResponse.json({ error: "target is required" }, { status: 400 });
  if (!validTarget(target)) return NextResponse.json({ error: "target must be a valid hostname or IP address" }, { status: 400 });

  try {
    const outcome = await probeOne(target, kind, request.signal);
    if (!outcome.succeeded && outcome.packetLoss === undefined) {
      return NextResponse.json({ error: outcome.error ?? `RIPE Atlas probe failed for ${target}` }, { status: 502 });
    }
    return NextResponse.json({
      measurementTarget: target,
      rttMs: outcome.rttMs, hops: outcome.hops, packetLoss: outcome.packetLoss,
      statusCode: outcome.statusCode, sampleCount: 1,
    });
  } catch (error) {
    return NextResponse.json({ error: publicUpstreamError(error) }, { status: 502 });
  }
}
