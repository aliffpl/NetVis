/**
 * NetVis Custom Nodes
 *
 * Nodes scale proportionally with zoom at a 0.3 ratio — when you zoom in,
 * nodes grow but at 30% of the zoom rate, keeping them readable without
 * overwhelming the canvas. At low zoom, nodes show compact mode (icon +
 * label + status). Full details appear when zoom is high enough or when
 * the node is selected.
 *
 * Four handles (Top/Bottom/Left/Right) allow edges to connect to the
 * nearest side.
 */

"use client";

import { memo, useMemo } from "react";
import { Handle, Position, useStore, type NodeProps } from "@xyflow/react";
import {
  Router,
  ShieldAlert,
  Server,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NetworkNodeData, NodeType, NodeStatus } from "@/types";
import { cn } from "@/lib/utils";

interface NodeVisualConfig {
  Icon: LucideIcon;
  accent: string;
  bg: string;
  border: string;
  label: string;
}

const VISUALS: Record<NodeType, NodeVisualConfig> = {
  router: {
    Icon: Router,
    accent: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/40",
    label: "Router",
  },
  middlebox: {
    Icon: ShieldAlert,
    accent: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    label: "Middlebox",
  },
  "edge-server": {
    Icon: Server,
    accent: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/40",
    label: "Edge Server",
  },
  client: {
    Icon: Users,
    accent: "text-fuchsia-300",
    bg: "bg-fuchsia-500/10",
    border: "border-fuchsia-500/40",
    label: "Clients",
  },
};

const STATUS_DOT: Record<NodeStatus, string> = {
  online: "bg-emerald-400",
  degraded: "bg-amber-400",
  offline: "bg-rose-500",
  maintenance: "bg-sky-400",
  "no-data": "bg-zinc-500",
};

/** Below this zoom, show compact mode. */
const COMPACT_ZOOM_THRESHOLD = 0.65;

/**
 * Read the current zoom level from React Flow's store.
 * Uses a selector so nodes only re-render when zoom actually changes.
 */
function useZoom(): number {
  return useStore((s) => s.transform[2]);
}

interface NetVisNodeShellProps extends NodeProps {
  type: NodeType;
}

function NetVisNodeShell({ data, selected, type, id }: NetVisNodeShellProps) {
  const d = data as NetworkNodeData;
  const v = VISUALS[type];
  const { Icon } = v;
  const onActivePath = Boolean(d.onActivePath);
  const isSourceOrTarget = Boolean(d.distance === 0);
  const distanceLabel =
    d.distance === undefined
      ? null
      : d.distance === 0
        ? "source"
        : `${d.distance.toFixed(1)} ms`;

  const zoom = useZoom();

  // Proportional scaling: nodes grow at 0.3× the zoom rate.
  // At zoom=1.0, scale=1.0 (normal). At zoom=2.0, scale=1.3. At zoom=0.5, scale=0.85.
  // This keeps nodes readable when zoomed in without making them huge.
  const nodeScale = useMemo(() => {
    return Math.max(0.7, Math.min(1.5, 1 + (zoom - 1) * 0.3));
  }, [zoom]);

  const isCompact = zoom < COMPACT_ZOOM_THRESHOLD;
  const showFullDetails = !isCompact || selected;

  return (
    <div
      style={{
        transform: `scale(${nodeScale})`,
        transformOrigin: "center center",
      }}
      className={cn(
        "group relative flex flex-col rounded-lg border bg-card/95 shadow-lg backdrop-blur-sm transition-[transform,border-color,box-shadow] duration-150",
        isCompact ? "w-[130px] px-2 py-1.5 gap-1" : "w-[170px] px-3 py-2.5 gap-1.5",
        v.border,
        onActivePath && "node-glow border-primary/80",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
      data-node-id={id}
    >
      {/* Four handles — edges choose the nearest pair */}
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary/80" />
      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary/80" />
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-2 !border-background !bg-primary/60" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-2 !border-background !bg-primary/60" />

      {/* Header — always visible */}
      <div className="flex items-center gap-2">
        <div className={cn(
          "flex items-center justify-center rounded-md",
          isCompact ? "h-5 w-5" : "h-7 w-7",
          v.bg, v.accent,
        )}>
          <Icon className={isCompact ? "h-3 w-3" : "h-4 w-4"} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn(
            "truncate font-semibold text-foreground",
            isCompact ? "text-[10px]" : "text-xs",
          )}>{d.label}</div>
          {!isCompact && (
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{v.label}</div>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full",
            isCompact ? "h-1.5 w-1.5" : "h-2 w-2",
            STATUS_DOT[d.status],
            d.status !== "online" && "status-pulse",
          )}
          title={`Status: ${d.status}`}
        />
      </div>

      {/* Body — hidden in compact mode (unless selected) */}
      {showFullDetails && (
        <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="uppercase tracking-wide">{d.region}</span>
            {distanceLabel !== null && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[10px]",
                  isSourceOrTarget
                    ? "bg-primary/20 text-primary"
                    : onActivePath
                      ? "bg-primary/10 text-primary/90"
                      : "bg-muted text-muted-foreground",
                )}
                title="Shortest-path distance from source"
              >
                {distanceLabel}
              </span>
            )}
          </div>
          {d.cidr && (
            <div className="truncate font-mono text-[10px] text-foreground/70">{d.cidr}</div>
          )}
          {type === "router" && d.asn !== undefined && (
            <div className="text-[10px] text-muted-foreground">ASN {d.asn}</div>
          )}
          {type === "middlebox" && d.middleboxKind && (
            <div className="text-[10px] uppercase tracking-wide text-amber-300/80">
              {d.middleboxKind}
            </div>
          )}
          {d.cpuLoad !== undefined && (
            <div className="mt-0.5 flex items-center gap-1">
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70">CPU</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full transition-all",
                    d.cpuLoad > 80 ? "bg-rose-500" : d.cpuLoad > 60 ? "bg-amber-400" : "bg-emerald-400",
                  )}
                  style={{ width: `${Math.min(100, d.cpuLoad)}%` }}
                />
              </div>
              <span className="font-mono text-[9px] text-muted-foreground">{Math.round(d.cpuLoad)}%</span>
            </div>
          )}
          {d.status === "no-data" && (
            <div className="mt-0.5 text-[9px] uppercase tracking-wide text-zinc-500">
              No recent data
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const RouterNode = memo(function RouterNode(props: NodeProps) {
  return <NetVisNodeShell {...props} type="router" />;
});
export const MiddleboxNode = memo(function MiddleboxNode(props: NodeProps) {
  return <NetVisNodeShell {...props} type="middlebox" />;
});
export const EdgeServerNode = memo(function EdgeServerNode(props: NodeProps) {
  return <NetVisNodeShell {...props} type="edge-server" />;
});
export const ClientNode = memo(function ClientNode(props: NodeProps) {
  return <NetVisNodeShell {...props} type="client" />;
});

export const nodeTypes = {
  router: RouterNode,
  middlebox: MiddleboxNode,
  "edge-server": EdgeServerNode,
  client: ClientNode,
};
