import type { RuntimeDebugContext } from "../reactivity/context";
import type { ReactiveEdge, ReactiveNode } from "../reactivity/shape";
import type {
  RuntimeDebugContextSnapshot,
  RuntimeDebugEvent,
  RuntimeDebugEventType,
  RuntimeDebugListener,
  RuntimeDebugNodeRef,
  RuntimeDebugNodeSnapshot,
  RuntimeDebugOptions,
} from "./debug.types";

type RecordDebugEventInput = {
  consumer?: ReactiveNode;
  detail?: Record<string, unknown>;
  node?: ReactiveNode;
  source?: ReactiveNode;
  target?: ReactiveNode;
};

interface RuntimeDebugImplementation {
  clearDebugHistory(context: RuntimeDebugContext): void;
  collectDebugNodeRefs(
    edge: ReactiveEdge | null,
    selectNode: (edge: ReactiveEdge) => ReactiveNode,
    next: (edge: ReactiveEdge) => ReactiveEdge | null,
  ): RuntimeDebugNodeRef[];
  configureDebugContext(
    context: RuntimeDebugContext,
    options?: RuntimeDebugOptions,
  ): RuntimeDebugContextSnapshot | undefined;
  labelDebugNode<T extends ReactiveNode>(
    node: T,
    label: string | null | undefined,
  ): T;
  observeDebugContext(
    context: RuntimeDebugContext,
    listener: RuntimeDebugListener,
  ): () => void;
  readDebugHistory(context: RuntimeDebugContext): RuntimeDebugEvent[];
  recordDebugEvent(
    context: RuntimeDebugContext,
    type: RuntimeDebugEventType,
    input?: RecordDebugEventInput,
  ): RuntimeDebugEvent | undefined;
  snapshotDebugContext(
    context: RuntimeDebugContext,
  ): RuntimeDebugContextSnapshot | undefined;
  snapshotDebugNode(
    node: ReactiveNode,
  ): RuntimeDebugNodeSnapshot | undefined;
}

const noopUnsubscribe = () => {};

const runtimeDebug: RuntimeDebugImplementation = {
  clearDebugHistory() {},
  collectDebugNodeRefs() {
    return [];
  },
  configureDebugContext() {
    return undefined;
  },
  labelDebugNode(node) {
    return node;
  },
  observeDebugContext() {
    return noopUnsubscribe;
  },
  readDebugHistory() {
    return [];
  },
  recordDebugEvent() {
    return undefined;
  },
  snapshotDebugContext() {
    return undefined;
  },
  snapshotDebugNode() {
    return undefined;
  },
};

export function installRuntimeDebug(
  implementation: RuntimeDebugImplementation,
): void {
  runtimeDebug.clearDebugHistory = implementation.clearDebugHistory;
  runtimeDebug.collectDebugNodeRefs = implementation.collectDebugNodeRefs;
  runtimeDebug.configureDebugContext = implementation.configureDebugContext;
  runtimeDebug.labelDebugNode = implementation.labelDebugNode;
  runtimeDebug.observeDebugContext = implementation.observeDebugContext;
  runtimeDebug.readDebugHistory = implementation.readDebugHistory;
  runtimeDebug.recordDebugEvent = implementation.recordDebugEvent;
  runtimeDebug.snapshotDebugContext = implementation.snapshotDebugContext;
  runtimeDebug.snapshotDebugNode = implementation.snapshotDebugNode;
}

export function clearDebugHistory(context: RuntimeDebugContext): void {
  runtimeDebug.clearDebugHistory(context);
}

export function collectDebugNodeRefs(
  edge: ReactiveEdge | null,
  selectNode: (edge: ReactiveEdge) => ReactiveNode,
  next: (edge: ReactiveEdge) => ReactiveEdge | null,
): RuntimeDebugNodeRef[] {
  return runtimeDebug.collectDebugNodeRefs(edge, selectNode, next);
}

export function configureDebugContext(
  context: RuntimeDebugContext,
  options: RuntimeDebugOptions = {},
): RuntimeDebugContextSnapshot | undefined {
  return runtimeDebug.configureDebugContext(context, options);
}

export function labelDebugNode<T extends ReactiveNode>(
  node: T,
  label: string | null | undefined,
): T {
  return runtimeDebug.labelDebugNode(node, label);
}

export function observeDebugContext(
  context: RuntimeDebugContext,
  listener: RuntimeDebugListener,
): () => void {
  return runtimeDebug.observeDebugContext(context, listener);
}

export function readDebugHistory(
  context: RuntimeDebugContext,
): RuntimeDebugEvent[] {
  return runtimeDebug.readDebugHistory(context);
}

export function recordDebugEvent(
  context: RuntimeDebugContext,
  type: RuntimeDebugEventType,
  input: RecordDebugEventInput = {},
): RuntimeDebugEvent | undefined {
  return runtimeDebug.recordDebugEvent(context, type, input);
}

export function snapshotDebugContext(
  context: RuntimeDebugContext,
): RuntimeDebugContextSnapshot | undefined {
  return runtimeDebug.snapshotDebugContext(context);
}

export function snapshotDebugNode(
  node: ReactiveNode,
): RuntimeDebugNodeSnapshot | undefined {
  return runtimeDebug.snapshotDebugNode(node);
}
