/**
 * NetVis — Routing Algorithm Engine
 * Pure TypeScript implementations of Dijkstra and Bellman-Ford shortest-path
 * algorithms with step-by-step state traces for visualization.
 *
 * Edge weights are the `latency` field (in ms). A small negative-weight
 * capability is preserved so Bellman-Ford can demonstrate negative-cycle
 * detection (useful for route-flap / counter-route anomalies).
 */

import type {
  AlgorithmName,
  AlgorithmResult,
  AlgorithmStep,
  NetVisEdge,
  NetVisNode,
} from "../types";

const INFINITY = Number.POSITIVE_INFINITY;

interface Graph {
  nodes: NetVisNode[];
  edges: NetVisEdge[];
  adjacency: Map<string, Array<{ target: string; weight: number; edgeId: string }>>;
}

function buildGraph(nodes: NetVisNode[], edges: NetVisEdge[]): Graph {
  const adjacency = new Map<string, Array<{ target: string; weight: number; edgeId: string }>>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    const weight = edge.data?.latency ?? 1;
    const src = edge.source;
    const tgt = edge.target;
    if (!adjacency.has(src)) adjacency.set(src, []);
    adjacency.get(src)!.push({ target: tgt, weight, edgeId: edge.id });
    if (edge.data?.directed !== true) {
      if (!adjacency.has(tgt)) adjacency.set(tgt, []);
      adjacency.get(tgt)!.push({ target: src, weight, edgeId: edge.id });
    }
  }
  return { nodes, edges, adjacency };
}

function snapshotState(
  distances: Map<string, number>,
  predecessors: Map<string, string | null>,
  visited: string[],
): Pick<AlgorithmStep, "distances" | "predecessors" | "visited"> {
  const distancesRecord: Record<string, number> = {};
  const predecessorsRecord: Record<string, string | null> = {};
  for (const [k, v] of distances.entries()) {
    distancesRecord[k] = v === INFINITY ? Infinity : v;
  }
  for (const [k, v] of predecessors.entries()) {
    predecessorsRecord[k] = v ?? null;
  }
  return { distances: distancesRecord, predecessors: predecessorsRecord, visited: [...visited] };
}

export function runDijkstra(
  nodes: NetVisNode[],
  edges: NetVisEdge[],
  source: string,
): AlgorithmResult {
  for (const edge of edges) {
    const weight = edge.data?.latency ?? 1;
    if (weight < 0) {
      throw new Error(`Dijkstra cannot run with negative edge weight on ${edge.id}: ${weight}`);
    }
  }
  const start = performance.now();
  const graph = buildGraph(nodes, edges);
  const distances = new Map<string, number>();
  const predecessors = new Map<string, string | null>();
  const visited = new Set<string>();
  const visitedOrder: string[] = [];
  const steps: AlgorithmStep[] = [];
  let stepIndex = 0;

  for (const node of nodes) {
    distances.set(node.id, INFINITY);
    predecessors.set(node.id, null);
  }
  distances.set(source, 0);

  steps.push({
    stepIndex: stepIndex++,
    description: `Initialize: distance[${source}] = 0, all other distances = ∞.`,
    improved: true,
    ...snapshotState(distances, predecessors, visitedOrder),
  });

  while (visited.size < nodes.length) {
    let current: string | null = null;
    let minDist = INFINITY;
    for (const node of nodes) {
      if (visited.has(node.id)) continue;
      const d = distances.get(node.id) ?? INFINITY;
      if (d < minDist) {
        minDist = d;
        current = node.id;
      }
    }
    if (current === null || minDist === INFINITY) break;

    visited.add(current);
    visitedOrder.push(current);

    steps.push({
      stepIndex: stepIndex++,
      description: `Select node ${current} (min tentative distance = ${minDist.toFixed(2)} ms).`,
      currentNode: current,
      improved: false,
      ...snapshotState(distances, predecessors, visitedOrder),
    });

    const neighbors = graph.adjacency.get(current) ?? [];
    for (const { target, weight, edgeId } of neighbors) {
      if (visited.has(target)) continue;
      const alt = (distances.get(current) ?? INFINITY) + weight;
      const currentDist = distances.get(target) ?? INFINITY;
      if (alt < currentDist) {
        distances.set(target, alt);
        predecessors.set(target, current);
        steps.push({
          stepIndex: stepIndex++,
          description: `Relax edge ${current} → ${target} (weight ${weight.toFixed(2)} ms). Improved ${target}: ${currentDist === INFINITY ? "∞" : currentDist.toFixed(2)} → ${alt.toFixed(2)} ms.`,
          currentNode: current,
          edge: { source: current, target },
          improved: true,
          ...snapshotState(distances, predecessors, visitedOrder),
        });
        void edgeId;
      } else {
        steps.push({
          stepIndex: stepIndex++,
          description: `Relax edge ${current} → ${target}: no improvement (${alt.toFixed(2)} ≥ ${currentDist === INFINITY ? "∞" : currentDist.toFixed(2)}).`,
          currentNode: current,
          edge: { source: current, target },
          improved: false,
          ...snapshotState(distances, predecessors, visitedOrder),
        });
      }
    }
  }

  const durationMs = performance.now() - start;
  const { distances: distRecord, predecessors: predRecord, visited: vis } = snapshotState(
    distances,
    predecessors,
    visitedOrder,
  );
  void vis;

  return {
    algorithm: "dijkstra",
    source,
    distances: distRecord,
    predecessors: predRecord,
    steps,
    hasNegativeCycle: false,
    durationMs,
  };
}

export function runBellmanFord(
  nodes: NetVisNode[],
  edges: NetVisEdge[],
  source: string,
): AlgorithmResult {
  const start = performance.now();
  const graph = buildGraph(nodes, edges);
  const distances = new Map<string, number>();
  const predecessors = new Map<string, string | null>();
  const visited: string[] = [];
  const steps: AlgorithmStep[] = [];
  let stepIndex = 0;

  for (const node of nodes) {
    distances.set(node.id, INFINITY);
    predecessors.set(node.id, null);
  }
  distances.set(source, 0);
  visited.push(source);

  steps.push({
    stepIndex: stepIndex++,
    description: `Initialize: distance[${source}] = 0, all other distances = ∞.`,
    improved: true,
    ...snapshotState(distances, predecessors, visited),
  });

  const flatEdges: Array<{ source: string; target: string; weight: number; edgeId: string }> = [];
  for (const [src, nbrs] of graph.adjacency.entries()) {
    for (const n of nbrs) flatEdges.push({ source: src, target: n.target, weight: n.weight, edgeId: n.edgeId });
  }

  const nodeCount = nodes.length;
  for (let pass = 0; pass < nodeCount - 1; pass++) {
    let anyImprovement = false;
    for (const e of flatEdges) {
      const du = distances.get(e.source) ?? INFINITY;
      if (du === INFINITY) continue;
      const dv = distances.get(e.target) ?? INFINITY;
      const alt = du + e.weight;
      if (alt < dv) {
        distances.set(e.target, alt);
        predecessors.set(e.target, e.source);
        if (!visited.includes(e.target)) visited.push(e.target);
        anyImprovement = true;
        steps.push({
          stepIndex: stepIndex++,
          description: `Pass ${pass + 1}: relax ${e.source} → ${e.target} (weight ${e.weight.toFixed(2)} ms). Improved ${e.target}: ${dv === INFINITY ? "∞" : dv.toFixed(2)} → ${alt.toFixed(2)} ms.`,
          currentNode: e.source,
          edge: { source: e.source, target: e.target },
          improved: true,
          ...snapshotState(distances, predecessors, visited),
        });
        void e.edgeId;
      }
    }
    if (!anyImprovement) {
      steps.push({
        stepIndex: stepIndex++,
        description: `Pass ${pass + 1}: no improvements — early termination.`,
        improved: false,
        ...snapshotState(distances, predecessors, visited),
      });
      break;
    }
  }

  let hasNegativeCycle = false;
  for (const e of flatEdges) {
    const du = distances.get(e.source) ?? INFINITY;
    if (du === INFINITY) continue;
    const dv = distances.get(e.target) ?? INFINITY;
    if (du + e.weight < dv) {
      hasNegativeCycle = true;
      steps.push({
        stepIndex: stepIndex++,
        description: `Negative cycle detected: edge ${e.source} → ${e.target} can still be relaxed (${(du + e.weight).toFixed(2)} < ${dv === INFINITY ? "∞" : dv.toFixed(2)}).`,
        currentNode: e.source,
        edge: { source: e.source, target: e.target },
        improved: true,
        negativeCycle: true,
        ...snapshotState(distances, predecessors, visited),
      });
      break;
    }
  }

  const durationMs = performance.now() - start;
  const { distances: distRecord, predecessors: predRecord } = snapshotState(
    distances,
    predecessors,
    visited,
  );

  return {
    algorithm: "bellman-ford",
    source,
    distances: distRecord,
    predecessors: predRecord,
    steps,
    hasNegativeCycle,
    durationMs,
  };
}

export function runAlgorithm(
  name: AlgorithmName,
  nodes: NetVisNode[],
  edges: NetVisEdge[],
  source: string,
  target?: string,
): AlgorithmResult {
  switch (name) {
    case "dijkstra":
      return runDijkstra(nodes, edges, source);
    case "bellman-ford":
      return runBellmanFord(nodes, edges, source);
    case "astar":
      return runAStar(nodes, edges, source, target ?? source);
    case "yen-kshortest":
      return runYenKShortest(nodes, edges, source, target ?? source, 3);
    case "ecmp":
      return runECMP(nodes, edges, source, target ?? source);
    default:
      return runDijkstra(nodes, edges, source);
  }
}

export function reconstructPath(
  predecessors: Record<string, string | null>,
  source: string,
  target: string,
): string[] | null {
  if (source === target) return [source];
  const path: string[] = [target];
  let current: string | null = target;
  const guard = new Set<string>();
  while (current !== null && current !== source) {
    if (guard.has(current)) return null;
    guard.add(current);
    const prev = predecessors[current];
    if (prev === null || prev === undefined) return null;
    path.unshift(prev);
    current = prev;
  }
  return path[0] === source ? path : null;
}

export function pathEdgeIds(
  edges: NetVisEdge[],
  path: string[] | null,
): string[] {
  if (!path || path.length < 2) return [];
  const result: string[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const found = edges.find(
      (e) =>
        (e.source === a && e.target === b) ||
        (e.data?.directed !== true && e.source === b && e.target === a),
    );
    if (found) result.push(found.id);
  }
  return result;
}

// ============================================================================
// Great-circle distance (for A* heuristic)
// ============================================================================

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two geographic coordinates in kilometers.
 * Used as the A* heuristic — it's admissible because geographic distance
 * is always ≤ network distance (the network can't be shorter than a
 * straight line).
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// ============================================================================
// A* Algorithm
// ============================================================================

/**
 * A* — Faster point-to-point shortest path using a great-circle heuristic.
 *
 * The heuristic estimates the remaining distance from any node to the target
 * using the haversine formula on the nodes' geographic coordinates. Since
 * network latency (in ms) is roughly proportional to geographic distance
 * (speed of light in fiber ≈ 200 km/ms), we convert km to ms by dividing
 * by 200. This makes the heuristic admissible: it never overestimates the
 * true network cost.
 *
 * Does NOT produce a step trace — returns only the final result with a summary.
 */
export function runAStar(
  nodes: NetVisNode[],
  edges: NetVisEdge[],
  source: string,
  target: string,
): AlgorithmResult {
  const start = performance.now();
  const graph = buildGraph(nodes, edges);

  // Build a map of node → geo coordinates
  const geoMap = new Map<string, { lat: number; lng: number }>();
  for (const node of nodes) {
    if (node.data.geo) {
      geoMap.set(node.id, node.data.geo);
    }
  }

  const targetGeo = geoMap.get(target);

  // Heuristic: great-circle distance in km / 200 = estimated ms
  function heuristic(nodeId: string): number {
    if (!targetGeo) return 0;
    const nodeGeo = geoMap.get(nodeId);
    if (!nodeGeo) return 0;
    return haversineKm(nodeGeo.lat, nodeGeo.lng, targetGeo.lat, targetGeo.lng) / 200;
  }

  const distances = new Map<string, number>();
  const predecessors = new Map<string, string | null>();
  const visited = new Set<string>();
  const fScores = new Map<string, number>(); // f = g + h

  for (const node of nodes) {
    distances.set(node.id, INFINITY);
    predecessors.set(node.id, null);
    fScores.set(node.id, INFINITY);
  }
  distances.set(source, 0);
  fScores.set(source, heuristic(source));

  while (visited.size < nodes.length) {
    // Find unvisited node with lowest f-score
    let current: string | null = null;
    let minF = INFINITY;
    for (const node of nodes) {
      if (visited.has(node.id)) continue;
      const f = fScores.get(node.id) ?? INFINITY;
      if (f < minF) {
        minF = f;
        current = node.id;
      }
    }
    if (current === null || minF === INFINITY) break;

    // Early exit: we reached the target
    if (current === target) break;

    visited.add(current);
    const neighbors = graph.adjacency.get(current) ?? [];
    for (const { target: neighbor, weight } of neighbors) {
      if (visited.has(neighbor)) continue;
      const alt = (distances.get(current) ?? INFINITY) + weight;
      if (alt < (distances.get(neighbor) ?? INFINITY)) {
        distances.set(neighbor, alt);
        predecessors.set(neighbor, current);
        fScores.set(neighbor, alt + heuristic(neighbor));
      }
    }
  }

  const durationMs = performance.now() - start;
  const { distances: distRecord, predecessors: predRecord } = snapshotState(
    distances,
    predecessors,
    [...visited],
  );

  const path = reconstructPath(predRecord, source, target);
  const pathCost = path ? distances.get(target) ?? 0 : 0;

  return {
    algorithm: "astar",
    source,
    distances: distRecord,
    predecessors: predRecord,
    steps: [],
    hasNegativeCycle: false,
    durationMs,
    summary: `A* found path to ${target} in ${durationMs.toFixed(2)} ms. Cost: ${pathCost.toFixed(2)} ms. Heuristic: great-circle distance.`,
    paths: path ? [{ nodeIds: path, edgeIds: pathEdgeIds(edges, path), cost: pathCost }] : [],
  };
}

// ============================================================================
// Yen's K-Shortest Paths Algorithm (K=3)
// ============================================================================

/**
 * Yen's K-shortest paths algorithm.
 *
 * Finds the K shortest loopless paths from source to target.
 * K=3: the primary path is solid, alternatives are dashed.
 *
 * Uses Dijkstra as the subroutine for finding shortest paths in spur graphs.
 */
export function runYenKShortest(
  nodes: NetVisNode[],
  edges: NetVisEdge[],
  source: string,
  target: string,
  k = 3,
): AlgorithmResult {
  const start = performance.now();
  const graph = buildGraph(nodes, edges);

  // Find the shortest path (1st path) using Dijkstra
  const firstResult = runDijkstra(nodes, edges, source);
  const firstPath = reconstructPath(firstResult.predecessors, source, target);

  if (!firstPath) {
    return {
      algorithm: "yen-kshortest",
      source,
      distances: firstResult.distances,
      predecessors: firstResult.predecessors,
      steps: [],
      hasNegativeCycle: false,
      durationMs: performance.now() - start,
      summary: `Yen's K-shortest: no path found from ${source} to ${target}.`,
      paths: [],
    };
  }

  const firstCost = firstResult.distances[target] ?? INFINITY;
  const allPaths: Array<{ nodeIds: string[]; edgeIds: string[]; cost: number }> = [
    { nodeIds: firstPath, edgeIds: pathEdgeIds(edges, firstPath), cost: firstCost },
  ];

  const candidates: Array<{ path: string[]; cost: number }> = [];
  const seenPaths = new Set<string>();
  seenPaths.add(firstPath.join(","));

  for (let ki = 1; ki < k; ki++) {
    const prevPath = allPaths[allPaths.length - 1].nodeIds;

    for (let i = 0; i < prevPath.length - 1; i++) {
      const spurNode = prevPath[i];
      const rootPath = prevPath.slice(0, i + 1);

      // Remove edges that are part of previous shortest paths sharing the same root
      const removedEdges: Array<{ from: string; to: string }> = [];
      for (const p of allPaths) {
        if (p.nodeIds.length > i && p.nodeIds.slice(0, i + 1).join(",") === rootPath.join(",")) {
          const from = p.nodeIds[i];
          const to = p.nodeIds[i + 1];
          if (from && to) removedEdges.push({ from, to });
        }
      }

      // Remove nodes in rootPath (except spurNode) from the graph
      const removedNodes = new Set(rootPath.slice(0, -1));

      // Build a filtered edge list
      const filteredEdges = edges.filter((e) => {
        // Skip edges between removed nodes
        if (removedNodes.has(e.source) || removedNodes.has(e.target)) return false;
        // Skip removed edges
        for (const re of removedEdges) {
          if (
            (e.source === re.from && e.target === re.to) ||
            (e.data?.directed !== true && e.source === re.to && e.target === re.from)
          ) {
            return false;
          }
        }
        return true;
      });

      const filteredNodes = nodes.filter((n) => !removedNodes.has(n.id));

      // Find spur path
      const spurResult = runDijkstra(filteredNodes, filteredEdges, spurNode);
      const spurPath = reconstructPath(spurResult.predecessors, spurNode, target);

      if (spurPath) {
        const totalPath = [...rootPath.slice(0, -1), ...spurPath];
        const rootCost = rootPath.reduce((sum, nodeId, idx) => {
          if (idx === 0) return 0;
          const prev = rootPath[idx - 1];
          const edge = graph.adjacency.get(prev)?.find((n) => n.target === nodeId);
          return sum + (edge?.weight ?? 0);
        }, 0);
        const spurCost = spurResult.distances[target] ?? INFINITY;
        const totalCost = rootCost + spurCost;

        const pathKey = totalPath.join(",");
        if (!seenPaths.has(pathKey)) {
          candidates.push({ path: totalPath, cost: totalCost });
          seenPaths.add(pathKey);
        }
      }
    }

    if (candidates.length === 0) break;

    // Sort candidates by cost and pick the lowest
    candidates.sort((a, b) => a.cost - b.cost);
    const next = candidates.shift()!;
    allPaths.push({
      nodeIds: next.path,
      edgeIds: pathEdgeIds(edges, next.path),
      cost: next.cost,
    });
  }

  const durationMs = performance.now() - start;
  const pathSummaries = allPaths.map((p, i) => `Path ${i + 1}: cost ${p.cost.toFixed(2)} ms`);

  return {
    algorithm: "yen-kshortest",
    source,
    distances: firstResult.distances,
    predecessors: firstResult.predecessors,
    steps: [],
    hasNegativeCycle: false,
    durationMs,
    summary: `Yen's K-shortest found ${allPaths.length} path${allPaths.length !== 1 ? "s" : ""} in ${durationMs.toFixed(2)} ms.\n${pathSummaries.join("\n")}`,
    paths: allPaths,
  };
}

// ============================================================================
// ECMP — Equal-Cost Multi-Path
// ============================================================================

/**
 * ECMP — discovers all equal-cost shortest paths from source to target.
 *
 * First runs Dijkstra to find the shortest distance, then does a BFS/DFS
 * from source to target, collecting all paths whose total cost equals the
 * shortest distance. All paths are highlighted together.
 */
export function runECMP(
  nodes: NetVisNode[],
  edges: NetVisEdge[],
  source: string,
  target: string,
): AlgorithmResult {
  const start = performance.now();
  const graph = buildGraph(nodes, edges);

  // First: find the shortest distance via Dijkstra
  const dijkstraResult = runDijkstra(nodes, edges, source);
  const shortestCost = dijkstraResult.distances[target] ?? INFINITY;

  if (shortestCost === INFINITY) {
    return {
      algorithm: "ecmp",
      source,
      distances: dijkstraResult.distances,
      predecessors: dijkstraResult.predecessors,
      steps: [],
      hasNegativeCycle: false,
      durationMs: performance.now() - start,
      summary: `ECMP: no path found from ${source} to ${target}.`,
      paths: [],
    };
  }

  // DFS to find all paths with cost === shortestCost
  const allPaths: Array<{ nodeIds: string[]; edgeIds: string[]; cost: number }> = [];
  const visited = new Set<string>();

  function dfs(current: string, path: string[], cost: number) {
    if (current === target) {
      if (Math.abs(cost - shortestCost) < 0.001) {
        allPaths.push({
          nodeIds: [...path],
          edgeIds: pathEdgeIds(edges, path),
          cost,
        });
      }
      return;
    }

    // Pruning: if current cost already exceeds shortest, bail
    if (cost > shortestCost) return;

    visited.add(current);
    const neighbors = graph.adjacency.get(current) ?? [];
    for (const { target: neighbor, weight } of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path, neighbor], cost + weight);
      }
    }
    visited.delete(current);
  }

  dfs(source, [source], 0);

  const durationMs = performance.now() - start;
  const { distances: distRecord, predecessors: predRecord } = snapshotState(
    new Map(Object.entries(dijkstraResult.distances)),
    new Map(Object.entries(dijkstraResult.predecessors)),
    [],
  );

  return {
    algorithm: "ecmp",
    source,
    distances: distRecord,
    predecessors: predRecord,
    steps: [],
    hasNegativeCycle: false,
    durationMs,
    summary: `ECMP found ${allPaths.length} equal-cost path${allPaths.length !== 1 ? "s" : ""} (cost ${shortestCost.toFixed(2)} ms) in ${durationMs.toFixed(2)} ms.`,
    paths: allPaths,
  };
}
