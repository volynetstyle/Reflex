import {
  clearDebugHistory,
  configureDebugContext,
  labelDebugNode,
  observeDebugContext,
  readDebugHistory,
  snapshotDebugContext,
  snapshotDebugNode,
} from "./debug.runtime";
import { getCurrentComputedInternal } from "./internal";
import { getDefaultContext } from "./reactivity/context";
import type { ExecutionContext } from "./reactivity/context";
import type { ReactiveNode } from "./reactivity/shape";
import type {
  RuntimeDebugContextSnapshot,
  RuntimeDebugEvent,
  RuntimeDebugListener,
  RuntimeDebugNodeSnapshot,
  RuntimeDebugOptions,
} from "./debug.types";

const noopUnsubscribe = () => {};
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

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
  enabled: IS_DEV,

  currentComputed(context = getDefaultContext()) {
    return getCurrentComputedInternal(context);
  },

  context(context = getDefaultContext()) {
    if (!IS_DEV) return undefined;
    return snapshotDebugContext(context);
  },

  label(node, label) {
    if (!IS_DEV) return node;
    return labelDebugNode(node, label);
  },

  snapshot(node) {
    if (!IS_DEV) return undefined;
    return snapshotDebugNode(node);
  },

  history(context = getDefaultContext()) {
    if (!IS_DEV) return [];
    return readDebugHistory(context);
  },

  clearHistory(context = getDefaultContext()) {
    if (!IS_DEV) return;
    clearDebugHistory(context);
  },

  configure(options = {}, context = getDefaultContext()) {
    if (!IS_DEV) return undefined;
    return configureDebugContext(context, options);
  },

  observe(listener, context = getDefaultContext()) {
    if (!IS_DEV) return noopUnsubscribe;
    return observeDebugContext(context, listener);
  },
};
