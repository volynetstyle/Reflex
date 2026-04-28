import type { Core } from "cytoscape";
import type { RuntimeDebugNodeRef } from "@volynets/reflex-runtime/debug";
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

type AdjacencyMap = Map<number, Set<number>>;
type PositionMap = Map<number, { x: number; y: number }>;

function buildAdjacency(edges: Map<string, RuntimeGraphEdge>): {
  children: AdjacencyMap;
  parents: AdjacencyMap;
} {
  const children: AdjacencyMap = new Map();
  const parents: AdjacencyMap = new Map();

  for (const edge of edges.values()) {
    if (!children.has(edge.source)) children.set(edge.source, new Set());
    if (!children.has(edge.target)) children.set(edge.target, new Set());
    if (!parents.has(edge.source)) parents.set(edge.source, new Set());
    if (!parents.has(edge.target)) parents.set(edge.target, new Set());

    children.get(edge.source)?.add(edge.target);
    parents.get(edge.target)?.add(edge.source);
  }

  return { children, parents };
}

function findRoots(
  nodes: Map<number, LayoutNode>,
  parents: AdjacencyMap,
  connectedNodeIds: Set<number>,
): number[] {
  const roots: number[] = [];

  for (const id of connectedNodeIds) {
    if (!nodes.has(id)) continue;

    const nodeParents = parents.get(id);
    if (nodeParents === undefined || nodeParents.size === 0) {
      roots.push(id);
    }
  }

  return roots.sort((a, b) => a - b);
}

function sortedChildren(children: AdjacencyMap, nodeId: number): number[] {
  return [...(children.get(nodeId) ?? [])].sort((a, b) => a - b);
}

function subtreeWidth(
  nodeId: number,
  children: AdjacencyMap,
  siblingGap: number,
  cache: Map<number, number>,
  visiting: Set<number>,
): number {
  const cached = cache.get(nodeId);
  if (cached !== undefined) return cached;

  if (visiting.has(nodeId)) {
    return siblingGap;
  }

  visiting.add(nodeId);

  const childIds = sortedChildren(children, nodeId);
  if (childIds.length === 0) {
    visiting.delete(nodeId);
    cache.set(nodeId, siblingGap);
    return siblingGap;
  }

  let total = 0;
  for (const childId of childIds) {
    total += subtreeWidth(childId, children, siblingGap, cache, visiting);
  }

  visiting.delete(nodeId);
  cache.set(nodeId, Math.max(total, siblingGap));
  return Math.max(total, siblingGap);
}

function placeSubtree(
  nodeId: number,
  centerX: number,
  y: number,
  children: AdjacencyMap,
  levelGap: number,
  siblingGap: number,
  widthCache: Map<number, number>,
  positions: PositionMap,
  visited: Set<number>,
): void {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  positions.set(nodeId, { x: centerX, y });

  const childIds = sortedChildren(children, nodeId).filter(
    (childId) => !visited.has(childId),
  );
  if (childIds.length === 0) return;

  const totalWidth = childIds.reduce(
    (sum, id) => sum + (widthCache.get(id) ?? siblingGap),
    0,
  );

  let currentX = centerX - totalWidth / 2;
  const childY = y + levelGap;

  for (const childId of childIds) {
    const width = widthCache.get(childId) ?? siblingGap;
    const childCenterX = currentX + width / 2;

    placeSubtree(
      childId,
      childCenterX,
      childY,
      children,
      levelGap,
      siblingGap,
      widthCache,
      positions,
      visited,
    );

    currentX += width;
  }
}

function computePositions(
  nodes: Map<number, LayoutNode>,
  edges: Map<string, RuntimeGraphEdge>,
  connectedNodeIds: Set<number>,
  options: LayoutOptions,
): PositionMap {
  const positions: PositionMap = new Map();
  const { children, parents } = buildAdjacency(edges);
  const roots = findRoots(nodes, parents, connectedNodeIds);
  const widthCache = new Map<number, number>();
  const visited = new Set<number>();

  const layoutRoots =
    roots.length > 0 ? roots : [...connectedNodeIds].sort((a, b) => a - b);

  for (const root of layoutRoots) {
    subtreeWidth(root, children, options.siblingGap, widthCache, new Set());
  }

  let cursorX = options.originX;

  for (const root of layoutRoots) {
    if (visited.has(root)) continue;

    const width = widthCache.get(root) ?? options.siblingGap;
    const centerX = cursorX + width / 2;

    placeSubtree(
      root,
      centerX,
      options.originY,
      children,
      options.levelGap,
      options.siblingGap,
      widthCache,
      positions,
      visited,
    );

    cursorX += width + options.siblingGap;
  }

  let maxY = options.originY;
  for (const position of positions.values()) {
    maxY = Math.max(maxY, position.y);
  }

  let orphanX = options.originX;
  const orphanY = maxY + options.levelGap;
  for (const id of connectedNodeIds) {
    if (positions.has(id)) continue;

    positions.set(id, { x: orphanX, y: orphanY });
    orphanX += options.siblingGap;
  }

  return positions;
}

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

  rememberManualPosition(nodeId: number, position: { x: number; y: number }): void {
    this.manualPositions.set(nodeId, position);
  }

  updateOptions(options: Partial<LayoutOptions>): void {
    this.options = { ...this.options, ...options };
  }
}
