import {
  clearDebugHistory,
  configureDebugContext,
  labelDebugNode,
  observeDebugContext,
  readDebugHistory,
  snapshotDebugContext,
  snapshotDebugNode,
  type RuntimeDebugContextSnapshot,
  type RuntimeDebugEvent,
  type RuntimeDebugListener,
  type RuntimeDebugNodeSnapshot,
  type RuntimeDebugOptions,
} from "./debug";
import { getCurrentComputedInternal } from "./internal";
import { getDefaultContext } from "./reactivity/context";
import type { ExecutionContext } from "./reactivity/context";
import type { ReactiveNode } from "./reactivity/shape";

const noopUnsubscribe = () => {};

export interface RuntimeSubtle {
  readonly enabled: boolean;
  clearHistory(context?: ExecutionContext): void;
  configure(
    options?: RuntimeDebugOptions,
    context?: ExecutionContext,
  ): RuntimeDebugContextSnapshot | undefined;
  context(context?: ExecutionContext): RuntimeDebugContextSnapshot | undefined;
  currentComputed(context?: ExecutionContext): ReactiveNode | undefined;
  history(context?: ExecutionContext): RuntimeDebugEvent[];
  label<T extends ReactiveNode>(
    node: T,
    label: string | null | undefined,
  ): T;
  observe(
    listener: RuntimeDebugListener,
    context?: ExecutionContext,
  ): () => void;
  snapshot(node: ReactiveNode): RuntimeDebugNodeSnapshot | undefined;
}

export type {
  RuntimeDebugContextSnapshot,
  RuntimeDebugEvent,
  RuntimeDebugListener,
  RuntimeDebugNodeSnapshot,
  RuntimeDebugOptions,
};

export const subtle: RuntimeSubtle = {
  enabled: __DEV__,

  currentComputed(context = getDefaultContext()) {
    return getCurrentComputedInternal(context);
  },

  context(context = getDefaultContext()) {
    if (!__DEV__) return undefined;
    return snapshotDebugContext(context);
  },

  label(node, label) {
    if (!__DEV__) return node;
    return labelDebugNode(node, label);
  },

  snapshot(node) {
    if (!__DEV__) return undefined;
    return snapshotDebugNode(node);
  },

  history(context = getDefaultContext()) {
    if (!__DEV__) return [];
    return readDebugHistory(context);
  },

  clearHistory(context = getDefaultContext()) {
    if (!__DEV__) return;
    clearDebugHistory(context);
  },

  configure(options = {}, context = getDefaultContext()) {
    if (!__DEV__) return undefined;
    return configureDebugContext(context, options);
  },

  observe(listener, context = getDefaultContext()) {
    if (!__DEV__) return noopUnsubscribe;
    return observeDebugContext(context, listener);
  },
};
