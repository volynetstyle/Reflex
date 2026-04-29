import type {
  RuntimeDebugEvent,
  RuntimeDebugGraphSnapshot,
  RuntimeDebugNodeRef,
} from "@volynets/reflex/debug";
import { RUNTIME_GRAPH_HISTORY_LIMIT } from "./RuntimeConstants";

export type RuntimeGraphEdge = {
  id: string;
  source: number;
  target: number;
};

export type RuntimeGraphModel = {
  eventCount: number;
  history: RuntimeDebugEvent[];
  nodes: Map<number, RuntimeDebugNodeRef>;
  edges: Map<string, RuntimeGraphEdge>;
  changedNodeIds: Set<number>;
};

export function createGraphModel(): RuntimeGraphModel {
  return {
    eventCount: 0,
    history: [],
    nodes: new Map(),
    edges: new Map(),
    changedNodeIds: new Set(),
  };
}

export function applyGraphSnapshot(
  model: RuntimeGraphModel,
  snapshot: RuntimeDebugGraphSnapshot,
): void {
  model.nodes.clear();
  model.edges.clear();
  model.changedNodeIds.clear();

  for (const node of snapshot.nodes) {
    model.nodes.set(node.id, node);
  }

  for (const edge of snapshot.edges) {
    const id = `${edge.from.id}->${edge.to.id}`;
    model.edges.set(id, {
      id,
      source: edge.from.id,
      target: edge.to.id,
    });
  }
}

export function formatNodeLabel(node: RuntimeDebugNodeRef): string {
  return node.label ?? `${node.kind} #${node.id}`;
}

function rememberNode(
  nodes: Map<number, RuntimeDebugNodeRef>,
  node: RuntimeDebugNodeRef | undefined,
): void {
  if (node !== undefined) nodes.set(node.id, node);
}

function rememberEdge(
  edges: Map<string, RuntimeGraphEdge>,
  source: RuntimeDebugNodeRef | undefined,
  target: RuntimeDebugNodeRef | undefined,
): void {
  if (source === undefined || target === undefined) return;

  const id = `${source.id}->${target.id}`;
  edges.set(id, { id, source: source.id, target: target.id });
}

function forgetEdge(
  edges: Map<string, RuntimeGraphEdge>,
  source: RuntimeDebugNodeRef | undefined,
  target: RuntimeDebugNodeRef | undefined,
): void {
  if (source !== undefined && target !== undefined) {
    edges.delete(`${source.id}->${target.id}`);
  }
}

function forgetIncidentEdges(
  edges: Map<string, RuntimeGraphEdge>,
  node: RuntimeDebugNodeRef | undefined,
): void {
  if (node === undefined) return;

  const nodeId = node.id;
  for (const [id, edge] of edges) {
    if (edge.source === nodeId || edge.target === nodeId) {
      edges.delete(id);
    }
  }
}

function readRemovedSources(event: RuntimeDebugEvent): RuntimeDebugNodeRef[] {
  const removedSources = event.detail?.removedSources;
  if (!Array.isArray(removedSources)) return [];

  const result: RuntimeDebugNodeRef[] = [];
  for (const source of removedSources) {
    if (
      source !== null &&
      typeof source === "object" &&
      "id" in source &&
      "kind" in source
    ) {
      result.push(source as RuntimeDebugNodeRef);
    }
  }

  return result;
}

export function applyGraphEvent(
  model: RuntimeGraphModel,
  event: RuntimeDebugEvent,
): void {
  model.eventCount += 1;
  model.changedNodeIds.clear();
  model.history.push(event);

  if (model.history.length > RUNTIME_GRAPH_HISTORY_LIMIT) {
    model.history.splice(
      0,
      model.history.length - RUNTIME_GRAPH_HISTORY_LIMIT,
    );
  }

  const { node, source, target, consumer } = event;

  rememberNode(model.nodes, node);
  rememberNode(model.nodes, source);
  rememberNode(model.nodes, target);
  rememberNode(model.nodes, consumer);

  const { changedNodeIds } = model;
  if (node !== undefined) changedNodeIds.add(node.id);
  if (source !== undefined) changedNodeIds.add(source.id);
  if (target !== undefined) changedNodeIds.add(target.id);
  if (consumer !== undefined) changedNodeIds.add(consumer.id);

  if (event.type === "track:read") {
    rememberEdge(model.edges, source, consumer);
    return;
  }

  if (event.type === "cleanup:stale-sources") {
    for (const removedSource of readRemovedSources(event)) {
      rememberNode(model.nodes, removedSource);
      forgetEdge(model.edges, removedSource, node);
    }
    return;
  }

  if (event.type === "watcher:dispose" && node !== undefined) {
    forgetIncidentEdges(model.edges, node);
  }
}

export function buildGraph(events: RuntimeDebugEvent[]): RuntimeGraphModel {
  const model = createGraphModel();

  for (const event of events) {
    applyGraphEvent(model, event);
  }

  return model;
}

export function getConnectedNodeIds(
  edges: Map<string, RuntimeGraphEdge>,
): Set<number> {
  const connectedNodeIds = new Set<number>();

  for (const edge of edges.values()) {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  }

  return connectedNodeIds;
}
