/**
 * EndpointProbe — UI for running live network probes.
 *
 * FIX #4b: The probe now reads the active `dataSource` from the store.
 * - In Live API mode, every probe (HTTP / DNS / ICMP / Trace) calls the
 *   /api/ripe-atlas route which proxies to the public RIPE Atlas API
 *   and returns real RTT, hops, and packet-loss for the requested target.
 * - In Demo mode, the probe derives a synthetic RTT from the active
 *   shortest-path distance (preserving the academic demo behavior).
 */

"use client";

import { useCallback, useState } from "react";
import { Globe, Server, Network, Route, Play, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ProbeKind, ProbeResult, ProbeStatus } from "@/types";
import { useNetworkStore } from "@/store/useNetworkStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PROBE_META: Record<ProbeKind, { Icon: LucideIcon; label: string; placeholder: string }> = {
  http: { Icon: Globe, label: "HTTP", placeholder: "google.com" },
  dns: { Icon: Network, label: "DNS", placeholder: "cloudflare.com" },
  icmp: { Icon: Server, label: "ICMP", placeholder: "1.1.1.1" },
  traceroute: { Icon: Route, label: "Trace", placeholder: "8.8.8.8" },
};

const STATUS_VISUAL: Record<ProbeStatus, { color: string; Icon: LucideIcon }> = {
  pending: { color: "text-muted-foreground", Icon: Clock },
  running: { color: "text-sky-300", Icon: Loader2 },
  success: { color: "text-emerald-300", Icon: CheckCircle2 },
  failed: { color: "text-rose-300", Icon: XCircle },
  timeout: { color: "text-amber-300", Icon: Clock },
};

export function EndpointProbe() {
  const probes = useNetworkStore((s) => s.probes);
  const addProbe = useNetworkStore((s) => s.addProbe);
  const updateProbe = useNetworkStore((s) => s.updateProbe);
  const dataSource = useNetworkStore((s) => s.dataSource);
  const result = useNetworkStore((s) => s.result);
  const sourceNode = useNetworkStore((s) => s.sourceNode);
  const nodes = useNetworkStore((s) => s.nodes);

  const [kind, setKind] = useState<ProbeKind>("icmp");
  const [target, setTarget] = useState("");

  const runProbe = useCallback(async () => {
    if (!target.trim()) return;
    const id = `probe-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const ts = Date.now();
    const trimmed = target.trim();
    const initial: ProbeResult = { id, ts, kind, target: trimmed, status: "running" };
    addProbe(initial);

    try {
      if (dataSource === "api") {
        // LIVE mode: call the RIPE Atlas proxy route.
        const response = await fetch(
          `/api/ripe-atlas?mode=probe&target=${encodeURIComponent(trimmed)}&kind=${kind}`,
        );
        const data = await response.json() as {
          rttMs?: number;
          hops?: ProbeResult["hops"];
          packetLoss?: number;
          statusCode?: number;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? `RIPE Atlas probe failed for ${trimmed}`);
        }
        updateProbe(id, {
          status: "success",
          rttMs: data.rttMs,
          hops: data.hops,
          statusCode: data.statusCode,
        });
      } else {
        // DEMO mode: derive synthetic RTT from active shortest-path distance.
        await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));
        let rtt = 20 + Math.random() * 80;
        const matched = nodes.find(
          (n) =>
            n.data.cidr?.includes(trimmed) ||
            n.data.label?.toLowerCase().includes(trimmed.toLowerCase()) ||
            n.id.includes(trimmed.toLowerCase()),
        );
        if (matched && result && result.distances[matched.id] !== undefined && result.distances[matched.id] !== Infinity) {
          rtt = result.distances[matched.id] + Math.random() * 5;
        }
        const willFail = Math.random() < 0.15;
        if (willFail) {
          updateProbe(id, {
            status: "failed",
            rttMs: rtt,
            error: "Demo mode: simulated probe failure (15% chance).",
          });
        } else if (kind === "traceroute" && result) {
          const hops = buildDemoHops(result.predecessors, sourceNode, trimmed, nodes, rtt);
          updateProbe(id, { status: "success", rttMs: rtt, hops });
        } else {
          updateProbe(id, {
            status: "success",
            rttMs: rtt,
            statusCode: kind === "http" ? 200 : undefined,
            resolvedAddresses: kind === "dns" ? ["10.10.0.1", "10.10.0.2"] : undefined,
          });
        }
      }
      setTarget("");
    } catch (error) {
      updateProbe(id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Probe failed",
      });
    }
  }, [target, kind, addProbe, updateProbe, dataSource, nodes, result, sourceNode]);

  const meta = PROBE_META[kind];

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Route className="h-4 w-4 text-cyan-300" />
          Endpoint Probe
          <Badge
            variant="outline"
            className={cn(
              "ml-1 h-4 px-1.5 text-[9px] uppercase",
              dataSource === "api"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
            )}
          >
            {dataSource === "api" ? "Live" : "Demo"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 p-3 pt-1">
        <Tabs value={kind} onValueChange={(v) => setKind(v as ProbeKind)}>
          <TabsList className="grid h-8 w-full grid-cols-4 bg-muted/40">
            {(Object.keys(PROBE_META) as ProbeKind[]).map((k) => {
              const m = PROBE_META[k];
              return (
                <TabsTrigger key={k} value={k} className="text-[10px]">
                  <m.Icon className="mr-1 h-3 w-3" /> {m.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div className="flex gap-1.5">
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={meta.placeholder}
            className="h-8 text-[11px]"
            onKeyDown={(e) => { if (e.key === "Enter") runProbe(); }}
          />
          <Button size="sm" className="h-8 px-3" onClick={runProbe} disabled={!target.trim()}>
            <Play className="h-3 w-3" /> Run
          </Button>
        </div>

        <div className="text-[10px] text-muted-foreground">
          {dataSource === "api" ? (
            <>Probes query the public <span className="font-mono">RIPE Atlas</span> API. Try <span className="font-mono">1.1.1.1</span>, <span className="font-mono">google.com</span>, or <span className="font-mono">8.8.8.8</span>.</>
          ) : (
            <>Demo probes derive RTT from the active shortest-path distance. Switch to <span className="font-semibold text-emerald-300">Live API</span> for real measurements.</>
          )}
        </div>

        <ScrollArea className="flex-1 custom-scrollbar" style={{ maxHeight: 240 }}>
          {probes.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-[11px] text-muted-foreground">No probes yet. Run one above.</div>
          ) : (
            <ul className="space-y-1.5">
              {probes.map((p) => {
                const sv = STATUS_VISUAL[p.status];
                return (
                  <li key={p.id} className="rounded-md border border-border bg-muted/20 p-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <sv.Icon className={cn("h-3 w-3", sv.color, p.status === "running" && "animate-spin")} />
                        <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">{p.kind}</Badge>
                        <span className="font-mono text-[10px] text-foreground/80">{p.target}</span>
                      </div>
                      <span className="font-mono text-[9px] text-muted-foreground">{new Date(p.ts).toLocaleTimeString()}</span>
                    </div>
                    {p.rttMs !== undefined && (
                      <div className="mt-0.5 font-mono text-[10px] text-cyan-300">
                        RTT {p.rttMs.toFixed(1)} ms
                        {p.statusCode && <span className="ml-2 text-emerald-300">HTTP {p.statusCode}</span>}
                      </div>
                    )}
                    {p.resolvedAddresses && (
                      <div className="mt-0.5 font-mono text-[10px] text-emerald-300">A: {p.resolvedAddresses.join(", ")}</div>
                    )}
                    {p.hops && (
                      <div className="mt-1 space-y-0.5">
                        {p.hops.map((h) => (
                          <div key={h.ttl} className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                            <span className="w-5 text-right">{h.ttl}</span>
                            <span className="text-foreground/80">{h.host}</span>
                            <span className="ml-auto text-cyan-300">{h.rttMs.toFixed(1)} ms</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {p.error && <div className="mt-0.5 text-[10px] text-rose-300">⚠ {p.error}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function buildDemoHops(
  predecessors: Record<string, string | null>,
  source: string,
  targetStr: string,
  nodes: { id: string; data: { label?: string; cidr?: string } }[],
  rtt: number,
): ProbeResult["hops"] {
  const matched = nodes.find(
    (n) =>
      n.data.cidr?.includes(targetStr) ||
      n.data.label?.toLowerCase().includes(targetStr.toLowerCase()) ||
      n.id.includes(targetStr.toLowerCase()),
  );
  if (!matched) {
    return [
      { ttl: 1, host: "10.0.0.1", rttMs: rtt * 0.3 },
      { ttl: 2, host: "10.0.0.2", rttMs: rtt * 0.6 },
      { ttl: 3, host: targetStr, rttMs: rtt },
    ];
  }
  const chain: string[] = [matched.id];
  let current: string | null = matched.id;
  const guard = new Set<string>();
  while (current && current !== source) {
    if (guard.has(current)) break;
    guard.add(current);
    const prev = predecessors[current];
    if (!prev) break;
    chain.unshift(prev);
    current = prev;
  }
  const hops = chain.map((id, i) => {
    const node = nodes.find((n) => n.id === id);
    const host = node?.data.cidr?.split("/")[0] ?? node?.data.label ?? id;
    return { ttl: i + 1, host, rttMs: (rtt * (i + 1)) / chain.length };
  });
  return hops;
}
