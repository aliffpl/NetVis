/**
 * NetVis Custom Edge
 *
 * Edges connect to the nearest of the four handles (Top/Bottom/Left/Right)
 * based on the relative positions of source and target nodes. If two nodes
 * are side by side (horizontal distance dominates), the edge uses Left/Right
 * handles. If they are stacked vertically, it uses Top/Bottom.
 *
 * A margin factor prevents oscillation when nodes are nearly diagonal.
 */

"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { EdgeStatus, NetworkEdgeData } from "@/types";

const STATUS_COLOR: Record<EdgeStatus, { stroke: string; dot: string; bg: string }> = {
  healthy: {
    stroke: "oklch(0.75 0.18 195 / 0.7)",
    dot: "oklch(0.75 0.18 195)",
    bg: "bg-cyan-500/15 text-cyan-200 border-cyan-500/40",
  },
  congested: {
    stroke: "oklch(0.78 0.18 75 / 0.7)",
    dot: "oklch(0.78 0.18 75)",
    bg: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  },
  degraded: {
    stroke: "oklch(0.72 0.17 30 / 0.7)",
    dot: "oklch(0.72 0.17 30)",
    bg: "bg-orange-500/15 text-orange-200 border-orange-500/40",
  },
  down: {
    stroke: "oklch(0.65 0.22 22 / 0.5)",
    dot: "oklch(0.65 0.22 22)",
    bg: "bg-rose-500/15 text-rose-200 border-rose-500/40",
  },
};

/**
 * Choose the handle pair based on relative positions.
 *
 * Uses a ratio threshold: if |dx| / |dy| > 1.3, use Left/Right.
 * If |dy| / |dx| > 1.3, use Top/Bottom. Otherwise, use the default
 * (whichever axis has the larger absolute distance) to avoid
 * oscillation near the diagonal.
 */
function chooseHandles(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): { sourcePosition: Position; targetPosition: Position } {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // If the distance is negligible, default to Top/Bottom
  if (absDx < 5 && absDy < 5) {
    return { sourcePosition: Position.Bottom, targetPosition: Position.Top };
  }

  // Use a ratio to decide: horizontal if dx is significantly larger than dy
  const horizontalRatio = absDx / Math.max(absDy, 1);
  const verticalRatio = absDy / Math.max(absDx, 1);

  if (horizontalRatio > 1.3) {
    // Horizontal connection: use Left/Right
    return dx > 0
      ? { sourcePosition: Position.Right, targetPosition: Position.Left }
      : { sourcePosition: Position.Left, targetPosition: Position.Right };
  }

  if (verticalRatio > 1.3) {
    // Vertical connection: use Top/Bottom
    return dy > 0
      ? { sourcePosition: Position.Bottom, targetPosition: Position.Top }
      : { sourcePosition: Position.Top, targetPosition: Position.Bottom };
  }

  // Near-diagonal: pick the axis with the larger absolute distance
  if (absDx > absDy) {
    return dx > 0
      ? { sourcePosition: Position.Right, targetPosition: Position.Left }
      : { sourcePosition: Position.Left, targetPosition: Position.Right };
  }
  return dy > 0
    ? { sourcePosition: Position.Bottom, targetPosition: Position.Top }
    : { sourcePosition: Position.Top, targetPosition: Position.Bottom };
}

function NetVisEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
  animated,
}: EdgeProps) {
  const d = (data ?? {}) as Partial<NetworkEdgeData>;
  const status = d.status ?? "healthy";
  const colors = STATUS_COLOR[status];
  const onActivePath = Boolean(d.onActivePath);
  const relaxed = Boolean(d.relaxed);

  // Choose the nearest handle pair based on relative positions
  const { sourcePosition, targetPosition } = chooseHandles(sourceX, sourceY, targetX, targetY);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: onActivePath
            ? "oklch(0.75 0.18 195)"
            : relaxed
              ? "oklch(0.85 0.2 280 / 0.9)"
              : colors.stroke,
          strokeWidth: onActivePath ? 3 : selected ? 2.5 : relaxed ? 2.5 : 1.6,
          strokeDasharray: animated ? "6 4" : undefined,
        }}
        className={cn(
          animated ? "react-flow__edge-path" : undefined,
          relaxed && "react-flow__edge-relaxed",
        )}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm transition-colors",
            colors.bg,
            onActivePath && "ring-1 ring-primary/60",
            relaxed && "ring-1 ring-fuchsia-500/40",
          )}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: colors.dot }}
          />
          {d.label ? (
            <span className="font-mono">{d.label}</span>
          ) : (
            <span className="font-mono">{d.latency?.toFixed(1) ?? "?"} ms</span>
          )}
          {d.utilization !== undefined && d.utilization > 0.7 && (
            <span className="font-mono text-[9px] opacity-80">
              {(d.utilization * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const NetVisEdge = memo(NetVisEdgeComponent);

export const edgeTypes = {
  netvis: NetVisEdge,
};
