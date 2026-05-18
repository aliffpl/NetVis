/**
 * RealtimeCharts — Recharts visualizations for the rolling telemetry window.
 *
 * FIX #1: Each chart now uses <ResponsiveContainer height="100%" width="100%">
 * inside a flex-1 parent with min-h-0. This lets the charts dynamically fit
 * the constrained right-sidebar panel without blowing out the viewport.
 */

"use client";

import { useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useNetworkStore } from "@/store/useNetworkStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

const tooltipStyle = {
  backgroundColor: "oklch(0.17 0.012 240)",
  border: "1px solid oklch(1 0 0 / 8%)",
  borderRadius: "0.5rem",
  fontSize: "11px",
  color: "oklch(0.96 0.005 240)",
};

export function RealtimeCharts() {
  const history = useNetworkStore((s) => s.telemetryHistory);

  const data = useMemo(
    () => history.map((s) => ({
      ts: s.ts, time: formatTime(s.ts),
      avg: Number(s.avgLatency.toFixed(2)),
      p95: Number(s.p95Latency.toFixed(2)),
      throughput: Number((s.throughput / 1000).toFixed(2)),
      loss: Number((s.packetLoss * 100).toFixed(3)),
      anomalies: s.anomalyCount,
    })),
    [history],
  );

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader className="shrink-0 pb-2">
        <CardTitle className="text-sm font-semibold tracking-tight">Realtime Telemetry</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-2 pt-0">
        <Tabs defaultValue="latency" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid h-8 w-full shrink-0 grid-cols-3 bg-muted/40">
            <TabsTrigger value="latency" className="text-[11px]">Latency</TabsTrigger>
            <TabsTrigger value="throughput" className="text-[11px]">Synthetic Throughput</TabsTrigger>
            <TabsTrigger value="loss" className="text-[11px]">Loss</TabsTrigger>
          </TabsList>

          <TabsContent value="latency" className="mt-2 min-h-0 flex-1">
            <div className="h-full w-full min-h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.75 0.18 195)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="oklch(0.75 0.18 195)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
                  <XAxis dataKey="time" stroke="oklch(0.68 0.01 240)" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="oklch(0.68 0.01 240)" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={36} unit=" ms" />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "oklch(0.68 0.01 240)" }} />
                  <Area type="monotone" dataKey="avg" name="Avg (ms)" stroke="oklch(0.75 0.18 195)" strokeWidth={1.6} fill="url(#latencyGrad)" isAnimationActive={false} />
                  <Line type="monotone" dataKey="p95" name="P95 (ms)" stroke="oklch(0.78 0.18 75)" strokeWidth={1.4} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="throughput" className="mt-2 min-h-0 flex-1">
            <div className="h-full w-full min-h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
                  <XAxis dataKey="time" stroke="oklch(0.68 0.01 240)" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="oklch(0.68 0.01 240)" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={36} unit=" G" />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "oklch(0.68 0.01 240)" }} />
                  <Line type="monotone" dataKey="throughput" name="Synthetic Throughput (Gbps)" stroke="oklch(0.72 0.17 162)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="loss" className="mt-2 min-h-0 flex-1">
            <div className="h-full w-full min-h-[120px]">
              {data.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">No loss samples yet</div>
              ) : data.every((point) => point.loss === 0) ? (
                <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">No packet loss observed</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
                    <XAxis dataKey="time" stroke="oklch(0.68 0.01 240)" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis stroke="oklch(0.68 0.01 240)" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={36} unit="%" />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "oklch(0.68 0.01 240)" }} />
                    <Bar dataKey="loss" name="Packet Loss (%)" fill="oklch(0.72 0.17 30)" isAnimationActive={false} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
