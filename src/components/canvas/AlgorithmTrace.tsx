/**
 * AlgorithmTrace
 *
 * PHASE 3: Now supports both step-trace algorithms (Dijkstra, Bellman-Ford)
 * and summary-only algorithms (A*, Yen's K-shortest, ECMP, CSP).
 * For summary-only algorithms, the step controls are hidden and a summary
 * is shown instead.
 */

"use client";

import { ChevronLeft, ChevronRight, Play, Rewind, FastForward, Route } from "lucide-react";
import type { AlgorithmResult, AlgorithmStep } from "@/types";
import { useNetworkStore } from "@/store/useNetworkStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  result: AlgorithmResult | null;
  stepCursor: number;
  stepSnapshot: AlgorithmStep | null;
}

const ALGORITHM_LABELS: Record<string, string> = {
  "dijkstra": "Dijkstra",
  "bellman-ford": "Bellman-Ford",
  "astar": "A*",
  "yen-kshortest": "Yen's K-Shortest",
  "ecmp": "ECMP",
  "csp": "CSP",
};

export function AlgorithmTrace({ result, stepCursor, stepSnapshot }: Props) {
  const stepForward = useNetworkStore((s) => s.stepForward);
  const stepBackward = useNetworkStore((s) => s.stepBackward);
  const setStepCursor = useNetworkStore((s) => s.setStepCursor);
  const runRouting = useNetworkStore((s) => s.runRouting);

  if (!result) {
    return (
      <div className="rounded-md border border-border bg-card/80 p-3 text-[11px] text-muted-foreground backdrop-blur-sm">
        No routing result yet.
      </div>
    );
  }

  const totalSteps = result.steps.length;
  const hasSteps = totalSteps > 0;
  const atStart = stepCursor === 0;
  const atEnd = stepCursor >= totalSteps - 1;
  const label = ALGORITHM_LABELS[result.algorithm] ?? result.algorithm;

  return (
    <div className="flex w-[340px] flex-col gap-2 rounded-md border border-border bg-card/85 p-3 backdrop-blur-md shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
            {label}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {result.durationMs.toFixed(2)} ms
          </span>
        </div>
        {hasSteps ? (
          <div className="font-mono text-[10px] text-muted-foreground">
            {stepCursor + 1} / {totalSteps}
          </div>
        ) : (
          <div className="font-mono text-[10px] text-muted-foreground">
            {result.paths?.length ?? 0} path{(result.paths?.length ?? 0) !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Step trace (Dijkstra / Bellman-Ford) or summary (A*, Yen's, ECMP, CSP) */}
      {hasSteps ? (
        <div
          className={cn(
            "min-h-[52px] rounded border border-border bg-background/60 p-2 text-[11px] leading-snug",
            stepSnapshot?.negativeCycle && "border-rose-500/60 bg-rose-500/10",
          )}
        >
          {stepSnapshot ? (
            <span className="font-mono text-foreground/90">{stepSnapshot.description}</span>
          ) : (
            <span className="text-muted-foreground">No step data.</span>
          )}
          {stepSnapshot?.negativeCycle && (
            <div className="mt-1 text-[10px] font-semibold text-rose-300">
              ⚠ Negative-weight cycle detected — routing unstable.
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-[52px] rounded border border-border bg-background/60 p-2 text-[11px] leading-snug">
          {result.summary ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-foreground/90">
                <Route className="h-3 w-3 text-cyan-300" />
                <span className="font-mono">{result.summary.split("\n")[0]}</span>
              </div>
              {result.summary.split("\n").slice(1).map((line, i) => (
                <div key={i} className="font-mono text-[10px] text-muted-foreground pl-4">
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">No summary available.</span>
          )}
          {result.paths && result.paths.length > 1 && (
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              Primary path solid, alternatives highlighted.
            </div>
          )}
        </div>
      )}

      {/* Step controls (only for step-trace algorithms) */}
      {hasSteps && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setStepCursor(0)} disabled={atStart} title="Jump to start">
            <Rewind className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={stepBackward} disabled={atStart} title="Previous step">
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={stepForward} disabled={atEnd} title="Next step">
            <ChevronRight className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setStepCursor(totalSteps - 1)} disabled={atEnd} title="Jump to end">
            <FastForward className="h-3 w-3" />
          </Button>
          <Button variant="default" size="sm" className="ml-auto h-7 px-2" onClick={runRouting} title="Re-run algorithm">
            <Play className="h-3 w-3" /> Re-run
          </Button>
        </div>
      )}

      {/* Re-run button for non-step algorithms */}
      {!hasSteps && (
        <div className="flex items-center gap-1">
          <Button variant="default" size="sm" className="ml-auto h-7 px-2" onClick={runRouting} title="Re-run algorithm">
            <Play className="h-3 w-3" /> Re-run
          </Button>
        </div>
      )}
    </div>
  );
}
