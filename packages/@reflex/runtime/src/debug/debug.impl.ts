import {
  activeConsumer,
  propagationDepth,
  defaultContext,
  type RuntimeDebugContext,
} from "../reactivity/context";
import type { ReactiveEdge, ReactiveNode } from "../reactivity/shape";
import { DIRTY_STATE, ReactiveNodeState } from "../reactivity/shape";
import type {
  RuntimeDebugContextSnapshot,
  RuntimeDebugEvent,
  RuntimeDebugEventType,
  RuntimeDebugFlag,
  RuntimeDebugDirtyState,
  RuntimeDebugListener,
  RuntimeDebugNodeKind,
  RuntimeDebugNodeRef,
  RuntimeDebugNodeSnapshot,
  RuntimeDebugOptions,
} from "./debug.types";

const DEFAULT_HISTORY_LIMIT = 250;

interface RuntimeDebugState {
  id: number;
  nextEventId: number;
  history: RuntimeDebugEvent[];
  historyLimit: number;
  listeners: Set<RuntimeDebugListener>;
}

interface RuntimeDebugEventInput {
  consumer?: ReactiveNode;
  detail?: Record<string, unknown>;
  node?: ReactiveNode;
  source?: ReactiveNode;
  target?: ReactiveNode;
}

const contextStates = new WeakMap<object, RuntimeDebugState>();
const nodeIds = new WeakMap<ReactiveNode, number>();
const nodeLabels = new WeakMap<ReactiveNode, string>();
const invalidContextKey = {};
const invalidNodeIds = new Map<unknown, number>();

let nextContextId = 1;
let nextNodeId = 1;

function isObjectKey(value: unknown): value is object {
  return (
    (typeof value === "object" || typeof value === "function") && value !== null
  );
}

function normalizeHistoryLimit(
  historyLimit: number | undefined,
  fallback: number,
): number {
  if (historyLimit === undefined) return fallback;
  if (!Number.isFinite(historyLimit)) return fallback;

  return Math.max(0, Math.trunc(historyLimit));
}

function getDirtyState(state: number): RuntimeDebugDirtyState {
  const dirty = state & DIRTY_STATE;

  if (dirty === 0) return "clean";
  if (dirty === ReactiveNodeState.Invalid) return "invalid";
  if (dirty === ReactiveNodeState.Changed) return "changed";
  return "invalid+changed";
}

function getNodeKind(state: number): RuntimeDebugNodeKind {
  if ((state & ReactiveNodeState.Watcher) !== 0) return "watcher";
  if ((state & ReactiveNodeState.Consumer) !== 0) return "consumer";
  if ((state & ReactiveNodeState.Producer) !== 0) return "producer";
  return "unknown";
}

function getFlags(state: number): RuntimeDebugFlag[] {
  const flags: RuntimeDebugFlag[] = [];

  if ((state & ReactiveNodeState.Producer) !== 0) flags.push("producer");
  if ((state & ReactiveNodeState.Consumer) !== 0) flags.push("consumer");
  if ((state & ReactiveNodeState.Watcher) !== 0) flags.push("watcher");
  if ((state & ReactiveNodeState.Invalid) !== 0) flags.push("invalid");
  if ((state & ReactiveNodeState.Changed) !== 0) flags.push("changed");
  if ((state & ReactiveNodeState.Reentrant) !== 0) flags.push("visited");
  if ((state & ReactiveNodeState.Disposed) !== 0) flags.push("disposed");
  if ((state & ReactiveNodeState.Computing) !== 0) flags.push("computing");
  if ((state & ReactiveNodeState.Scheduled) !== 0) flags.push("scheduled");
  if ((state & ReactiveNodeState.Tracking) !== 0) flags.push("tracking");

  return flags;
}

function normalizeContextKey(context: RuntimeDebugContext): object {
  return isObjectKey(context) ? context : invalidContextKey;
}

function ensureContextState(context: RuntimeDebugContext): RuntimeDebugState {
  const key = normalizeContextKey(context);
  const existing = contextStates.get(key);

  if (existing) return existing;

  const state: RuntimeDebugState = {
    id: nextContextId++,
    nextEventId: 1,
    history: [],
    historyLimit: DEFAULT_HISTORY_LIMIT,
    listeners: new Set(),
  };

  contextStates.set(key, state);
  return state;
}

function ensureNodeId(node: ReactiveNode): number {
  if (!isObjectKey(node)) {
    const existing = invalidNodeIds.get(node);
    if (existing !== undefined) return existing;

    const id = nextNodeId++;
    invalidNodeIds.set(node, id);
    return id;
  }

  const existing = nodeIds.get(node);

  if (existing !== undefined) return existing;

  const id = nextNodeId++;
  nodeIds.set(node, id);
  return id;
}

function createNodeRef(node: ReactiveNode): RuntimeDebugNodeRef {
  if (!isObjectKey(node)) {
    return {
      id: ensureNodeId(node),
      kind: "unknown",
      dirty: "clean",
      flags: [],
      state: 0,
    };
  }

  const label = nodeLabels.get(node);
  const ref: RuntimeDebugNodeRef = {
    id: ensureNodeId(node),
    kind: getNodeKind(node.state),
    dirty: getDirtyState(node.state),
    flags: getFlags(node.state),
    state: node.state,
  };

  if (label !== undefined) {
    ref.label = label;
  }

  return ref;
}

function collectAdjacentNodes(
  edge: ReactiveEdge | null,
  selectNode: (edge: ReactiveEdge) => ReactiveNode,
  next: (edge: ReactiveEdge) => ReactiveEdge | null,
): RuntimeDebugNodeRef[] {
  const nodes: RuntimeDebugNodeRef[] = [];

  for (let cursor = edge; cursor !== null; cursor = next(cursor)) {
    nodes.push(createNodeRef(selectNode(cursor)));
  }

  return nodes;
}

function emitToListeners(
  listeners: Set<RuntimeDebugListener>,
  event: RuntimeDebugEvent,
): void {
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function pushHistory(state: RuntimeDebugState, event: RuntimeDebugEvent): void {
  if (state.historyLimit === 0) return;

  state.history.push(event);

  const overflow = state.history.length - state.historyLimit;
  if (overflow > 0) {
    state.history.splice(0, overflow);
  }
}

export function labelDebugNode<T extends ReactiveNode>(
  node: T,
  label: string | null | undefined,
): T {
  if (label && label.length > 0) {
    nodeLabels.set(node, label);
  } else {
    nodeLabels.delete(node);
  }

  return node;
}

export function configureDebugContext(
  context: RuntimeDebugContext = defaultContext,
  options: RuntimeDebugOptions = {},
): RuntimeDebugContextSnapshot {
  const state = ensureContextState(context);
  state.historyLimit = normalizeHistoryLimit(
    options.historyLimit,
    state.historyLimit,
  );

  const overflow = state.history.length - state.historyLimit;
  if (overflow > 0) {
    state.history.splice(0, overflow);
  }

  return snapshotDebugContext(context);
}

export function observeDebugContext(
  context: RuntimeDebugContext = defaultContext,
  listener: RuntimeDebugListener,
): () => void {
  const state = ensureContextState(context);
  state.listeners.add(listener);

  return () => {
    state.listeners.delete(listener);
  };
}

export function readDebugHistory(
  context: RuntimeDebugContext = defaultContext,
): RuntimeDebugEvent[] {
  return ensureContextState(context).history.slice();
}

export function clearDebugHistory(
  context: RuntimeDebugContext = defaultContext,
): void {
  ensureContextState(context).history.length = 0;
}

export function snapshotDebugContext(
  context: RuntimeDebugContext = defaultContext,
): RuntimeDebugContextSnapshot {
  const state = ensureContextState(context);
  const snapshot: RuntimeDebugContextSnapshot = {
    id: state.id,
    propagationDepth: propagationDepth,
    historyLimit: state.historyLimit,
    historySize: state.history.length,
    observerCount: state.listeners.size,
  };

  if (activeConsumer !== null) {
    snapshot.activeConsumer = createNodeRef(activeConsumer);
  }

  return snapshot;
}

export function snapshotDebugNode(
  node: ReactiveNode,
): RuntimeDebugNodeSnapshot {
  const sources = collectAdjacentNodes(
    node.firstIn,
    (edge) => edge.from,
    (edge) => edge.nextIn,
  );
  const subscribers = collectAdjacentNodes(
    node.firstOut,
    (edge) => edge.to,
    (edge) => edge.nextOut,
  );

  return {
    ...createNodeRef(node),
    payload: node.payload,
    hasCompute: node.compute !== null,
    inDegree: sources.length,
    outDegree: subscribers.length,
    sources,
    subscribers,
  };
}

export function collectDebugNodeRefs(
  edge: ReactiveEdge | null,
  selectNode: (edge: ReactiveEdge) => ReactiveNode,
  next: (edge: ReactiveEdge) => ReactiveEdge | null,
): RuntimeDebugNodeRef[] {
  return collectAdjacentNodes(edge, selectNode, next);
}

export function recordDebugEvent(
  context: RuntimeDebugContext = defaultContext,
  type: RuntimeDebugEventType,
  input: RuntimeDebugEventInput = {},
): RuntimeDebugEvent {
  const state = ensureContextState(context);
  const event: RuntimeDebugEvent = {
    id: state.nextEventId++,
    contextId: state.id,
    timestamp: Date.now(),
    type,
  };

  if (input.node !== undefined) {
    event.node = createNodeRef(input.node);
  }

  if (input.source !== undefined) {
    event.source = createNodeRef(input.source);
  }

  if (input.target !== undefined) {
    event.target = createNodeRef(input.target);
  }

  if (input.consumer !== undefined) {
    event.consumer = createNodeRef(input.consumer);
  }

  if (input.detail !== undefined) {
    event.detail = input.detail;
  }

  pushHistory(state, event);
  emitToListeners(state.listeners, event);
  return event;
}
