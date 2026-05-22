/**
 * NetworkCanvas
 *
 * FIX #1 (overflow-hidden): the wrapper div is `h-full w-full overflow-hidden`
 * so the canvas can never expand beyond its flex-1 parent and push the
 * sidebars off-screen.
 *
 * FIX #2 (fitView): React Flow's `fitView` prop is active and will auto-
 * scale the now-wider geographic projection into the available viewport.
 *
 * FIX #4: the floating <Panel position="top-center"> "Inspecting node:
 * <id>" indicator was previously rendered as a chip on the canvas. It is
 * intentionally REMOVED here because (a) it duplicated the inspector
 * dialog's header that already shows the selected entity, and (b) on
 * smaller viewports it visually overlapped with the inspector close
 * button row. Selection is now surfaced only via the inspector modal.
 */

"use client";

import { useCallback } from "react";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Panel,
  type NodeMouseHandler, type EdgeMouseHandler,
} from "@xyflow/react";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useNetworkSimulation } from "@/hooks/useNetworkSimulation";
import { nodeTypes } from "./CustomNodes";
import { edgeTypes } from "./CustomEdges";
import { AlgorithmTrace } from "./AlgorithmTrace";
import { GitBranch, Map } from "lucide-react";
import { IranMap } from "./IranMap";

export function NetworkCanvas() {
  const { nodes, edges, result, stepCursor, stepSnapshot } = useNetworkSimulation();

  const onNodesChange = useNetworkStore((s) => s.onNodesChange);
  const onEdgesChange = useNetworkStore((s) => s.onEdgesChange);
  const setSelected = useNetworkStore((s) => s.setSelected);

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    setSelected({ kind: "node", id: node.id });
  }, [setSelected]);

  const onEdgeClick: EdgeMouseHandler = useCallback((_e, edge) => {
    setSelected({ kind: "edge", id: edge.id });
  }, [setSelected]);

  const onPaneClick = useCallback(() => setSelected(null), [setSelected]);

  return (
    <div className="relative h-full w-full overflow-hidden canvas-grid-bg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: 0.3, maxZoom: 1.0 }}
        minZoom={0.15}
        maxZoom={3.0}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "netvis" }}
      >
        <IranMap />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="oklch(1 0 0 / 0.06)" />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          nodeColor={(n) => {
            switch (n.type) {
              case "router": return "oklch(0.75 0.18 195)";
              case "middlebox": return "oklch(0.78 0.18 75)";
              case "edge-server": return "oklch(0.72 0.17 162)";
              case "client": return "oklch(0.68 0.22 305)";
              default: return "oklch(0.5 0 0)";
            }
          }}
          nodeStrokeWidth={2}
          maskColor="oklch(0.13 0.01 240 / 0.7)"
          className="!h-32 !w-56"
        />

        <Panel position="top-left" className="!m-0 !p-0">
          <AlgorithmTrace result={result} stepCursor={stepCursor} stepSnapshot={stepSnapshot} />
        </Panel>

        <Panel position="top-right" className="!m-0">
          <div className="rounded-md border border-border bg-card/80 p-2.5 text-[11px] backdrop-blur-sm">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Map className="h-3 w-3" /> Topology Legend
            </div>
            <ul className="space-y-1">
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-cyan-500/70" /> Router (core / edge)</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500/70" /> Middlebox (DPI/FW/NAT/LB)</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/70" /> Edge server / CDN</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-fuchsia-500/70" /> Client access pool</li>
            </ul>
            <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-1.5 text-[10px] text-muted-foreground">
              <GitBranch className="h-3 w-3" /> Click a node or edge to inspect.
            </div>
          </div>
        </Panel>

        {/* FIX #4: Removed the top-center "Inspecting node/link: <id>" chip.
            It duplicated the inspector modal's header and visually clashed
            with the modal's close button row on narrow viewports. */}
      </ReactFlow>
    </div>
  );
}
