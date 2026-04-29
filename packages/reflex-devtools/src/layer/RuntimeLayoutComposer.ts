import type { Core } from "cytoscape";
import type { RuntimeDebugNodeRef } from "@volynets/reflex/debug";
import type { RuntimeGraphEdge } from "./RuntimeGraphModel";

export type LayoutNode = {
  id: number;
  kind: RuntimeDebugNodeRef["kind"];
};

export type LayoutOptions = {
  siblingGap: number;
  levelGap: number;
  originX: number;
  originY: number;
  incremental: boolean;
};

const DEFAULT_OPTIONS: LayoutOptions = {
  siblingGap: 150,
  levelGap: 140,
  originX: 80,
  originY: 80,
  incremental: true,
};

type AdjacencyMap = Map<number, number[]>;
type PositionMap = Map<number, { x: number; y: number }>;

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

function buildAdjacency(edges: Map<string, RuntimeGraphEdge>): {
  children: AdjacencyMap;
  parents: AdjacencyMap;
} {
  const children = new Map<number, number[]>();
  const parents = new Map<number, number[]>();

  for (const edge of edges.values()) {
    let out = children.get(edge.source);
    if (out === undefined) {
      out = [];
      children.set(edge.source, out);
    }
    if (!out.includes(edge.target)) out.push(edge.target);

    let incoming = parents.get(edge.target);
    if (incoming === undefined) {
      incoming = [];
      parents.set(edge.target, incoming);
    }
    if (!incoming.includes(edge.source)) incoming.push(edge.source);

    if (!children.has(edge.target)) children.set(edge.target, []);
    if (!parents.has(edge.source)) parents.set(edge.source, []);
  }

  for (const list of children.values()) list.sort((a, b) => a - b);
  for (const list of parents.values()) list.sort((a, b) => a - b);

  return { children, parents };
}

// ---------------------------------------------------------------------------
// Step 1 — Layer assignment via longest-path (Kahn's BFS variant)
//
// Every node gets layer = max(layer of all parents) + 1.
// This correctly handles diamonds: the shared child lands on the layer
// BELOW both parents, not on the layer of whichever parent visited it first.
// ---------------------------------------------------------------------------

function assignLayers(
  connectedNodeIds: Set<number>,
  children: AdjacencyMap,
  parents: AdjacencyMap,
): Map<number, number> {
  const layers = new Map<number, number>();
  // In-degree counter for Kahn's topological order
  const inDegree = new Map<number, number>();

  for (const id of connectedNodeIds) {
    const p = parents.get(id);
    inDegree.set(id, p ? p.length : 0);
  }

  const queue: number[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      layers.set(id, 0);
      queue.push(id);
    }
  }

  // BFS — longest-path variant: when a child already has a layer, keep max
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    const currentLayer = layers.get(id) ?? 0;

    for (const childId of children.get(id) ?? []) {
      const proposed = currentLayer + 1;
      const existing = layers.get(childId);

      if (existing === undefined || proposed > existing) {
        layers.set(childId, proposed);
      }

      // Decrement in-degree; only enqueue when all parents are processed
      const remaining = (inDegree.get(childId) ?? 1) - 1;
      inDegree.set(childId, remaining);
      if (remaining === 0) {
        queue.push(childId);
      }
    }
  }

  // Nodes not reached (in a cycle) get their own layer after the DAG portion
  let maxLayer = 0;
  for (const l of layers.values()) maxLayer = Math.max(maxLayer, l);

  for (const id of connectedNodeIds) {
    if (!layers.has(id)) {
      layers.set(id, ++maxLayer);
    }
  }

  return layers;
}

// ---------------------------------------------------------------------------
// Step 2 — Group nodes by layer
// ---------------------------------------------------------------------------

function groupByLayer(layers: Map<number, number>): Map<number, number[]> {
  const byLayer = new Map<number, number[]>();

  for (const [id, layer] of layers) {
    let group = byLayer.get(layer);
    if (group === undefined) {
      group = [];
      byLayer.set(layer, group);
    }
    group.push(id);
  }

  // Sort each layer's initial order by id for determinism
  for (const group of byLayer.values()) {
    group.sort((a, b) => a - b);
  }

  return byLayer;
}

// ---------------------------------------------------------------------------
// Step 3 — Barycenter heuristic for crossing minimisation
//
// For each layer (top-down), reorder nodes so the position of each node
// is as close as possible to the average x-position of its parents.
// Run two passes (top-down, bottom-up) for better results.
// ---------------------------------------------------------------------------

function barycenterSort(
  byLayer: Map<number, number[]>,
  parents: AdjacencyMap,
  children: AdjacencyMap,
  maxLayer: number,
): void {
  // We compute a temporary "slot index" per node within its layer to derive
  // barycenter scores. After sorting we commit the new order.

  function sortLayer(
    layerNodes: number[],
    neighbourMap: AdjacencyMap,
    positionOf: Map<number, number>,
  ): void {
    const scores = new Map<number, number>();

    for (const id of layerNodes) {
      const neighbours = neighbourMap.get(id);
      if (!neighbours || neighbours.length === 0) {
        scores.set(id, positionOf.get(id) ?? 0);
        continue;
      }
      let sum = 0;
      let count = 0;
      for (const nb of neighbours) {
        const pos = positionOf.get(nb);
        if (pos !== undefined) {
          sum += pos;
          count++;
        }
      }
      scores.set(id, count > 0 ? sum / count : (positionOf.get(id) ?? 0));
    }

    layerNodes.sort((a, b) => (scores.get(a) ?? 0) - (scores.get(b) ?? 0));
  }

  function buildPositionMap(): Map<number, number> {
    const pos = new Map<number, number>();
    for (const nodes of byLayer.values()) {
      nodes.forEach((id, idx) => pos.set(id, idx));
    }
    return pos;
  }

  // Two top-down passes, one bottom-up pass
  for (let pass = 0; pass < 2; pass++) {
    let posMap = buildPositionMap();
    for (let layer = 1; layer <= maxLayer; layer++) {
      const nodes = byLayer.get(layer);
      if (nodes) sortLayer(nodes, parents, posMap);
      posMap = buildPositionMap();
    }
  }

  {
    let posMap = buildPositionMap();
    for (let layer = maxLayer - 1; layer >= 0; layer--) {
      const nodes = byLayer.get(layer);
      if (nodes) sortLayer(nodes, children, posMap);
      posMap = buildPositionMap();
    }
  }
}

// ---------------------------------------------------------------------------
// Step 4 — Assign x/y coordinates
//
// Each layer is centred; nodes within a layer are spaced by siblingGap.
// Multiple disconnected component trees are laid out left-to-right.
// ---------------------------------------------------------------------------

function computePositions(
  nodes: Map<number, LayoutNode>,
  edges: Map<string, RuntimeGraphEdge>,
  connectedNodeIds: Set<number>,
  options: LayoutOptions,
): PositionMap {
  const { children, parents } = buildAdjacency(edges);
  const layers = assignLayers(connectedNodeIds, children, parents);
  const byLayer = groupByLayer(layers);

  let maxLayer = 0;
  for (const l of layers.values()) maxLayer = Math.max(maxLayer, l);

  barycenterSort(byLayer, parents, children, maxLayer);

  const positions: PositionMap = new Map();

  for (let layer = 0; layer <= maxLayer; layer++) {
    const group = byLayer.get(layer);
    if (!group || group.length === 0) continue;

    const totalWidth = (group.length - 1) * options.siblingGap;

    group.forEach((id, idx) => {
      if (!nodes.has(id)) return;
      const x =
        options.originX +
        idx * options.siblingGap -
        totalWidth / 2 +
        (group.length === 1 ? 0 : 0);
      const y = options.originY + layer * options.levelGap;
      positions.set(id, { x, y });
    });
  }

  // Orphans (not reached by layer assignment somehow) go below everything
  let maxY = options.originY;
  for (const p of positions.values()) maxY = Math.max(maxY, p.y);

  let orphanX = options.originX;
  const orphanY = maxY + options.levelGap;
  for (const id of connectedNodeIds) {
    if (positions.has(id)) continue;
    positions.set(id, { x: orphanX, y: orphanY });
    orphanX += options.siblingGap;
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Incremental change detection
// ---------------------------------------------------------------------------

function changedNodeIds(
  prevEdges: Map<string, RuntimeGraphEdge>,
  nextEdges: Map<string, RuntimeGraphEdge>,
): Set<number> {
  const changed = new Set<number>();
  const allEdgeIds = new Set([...prevEdges.keys(), ...nextEdges.keys()]);

  for (const id of allEdgeIds) {
    const prev = prevEdges.get(id);
    const next = nextEdges.get(id);

    if ((prev === undefined) === (next === undefined)) continue;

    const edge = next ?? prev;
    if (edge === undefined) continue;

    changed.add(edge.source);
    changed.add(edge.target);
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Public class — API identical to the original
// ---------------------------------------------------------------------------

export class RuntimeLayoutComposer {
  private manualPositions: PositionMap = new Map();
  private options: LayoutOptions;
  private prevEdges: Map<string, RuntimeGraphEdge> = new Map();

  constructor(options: Partial<LayoutOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  apply(
    cy: Core,
    nodes: Map<number, RuntimeDebugNodeRef>,
    edges: Map<string, RuntimeGraphEdge>,
    connectedNodeIds: Set<number>,
  ): Set<number> {
    const movedIds = new Set<number>();
    const structurallyChanged = this.options.incremental
      ? changedNodeIds(this.prevEdges, edges)
      : null;
    const positions = computePositions(
      nodes as Map<number, LayoutNode>,
      edges,
      connectedNodeIds,
      this.options,
    );

    cy.batch(() => {
      for (const [id, position] of positions) {
        const element = cy.getElementById(String(id));
        if (element.empty()) continue;

        const current = element.position();
        const manualPosition = this.manualPositions.get(id);
        const isNew = current.x === 0 && current.y === 0;
        const isChanged =
          structurallyChanged === null || structurallyChanged.has(id);

        if (manualPosition !== undefined) {
          if (
            Math.abs(current.x - manualPosition.x) > 0.5 ||
            Math.abs(current.y - manualPosition.y) > 0.5
          ) {
            element.position(manualPosition);
            movedIds.add(id);
          }
          continue;
        }

        if (!isNew && !isChanged) continue;

        if (
          Math.abs(current.x - position.x) > 0.5 ||
          Math.abs(current.y - position.y) > 0.5
        ) {
          element.position(position);
          movedIds.add(id);
        }
      }
    });

    this.prevEdges = new Map(edges);
    return movedIds;
  }

  forceApply(
    cy: Core,
    nodes: Map<number, RuntimeDebugNodeRef>,
    edges: Map<string, RuntimeGraphEdge>,
    connectedNodeIds: Set<number>,
  ): Set<number> {
    const prevIncremental = this.options.incremental;
    this.options.incremental = false;
    const moved = this.apply(cy, nodes, edges, connectedNodeIds);
    this.options.incremental = prevIncremental;
    return moved;
  }

  reset(): void {
    this.manualPositions = new Map();
    this.prevEdges = new Map();
  }

  rememberManualPosition(
    nodeId: number,
    position: { x: number; y: number },
  ): void {
    this.manualPositions.set(nodeId, position);
  }

  updateOptions(options: Partial<LayoutOptions>): void {
    this.options = { ...this.options, ...options };
  }
}
