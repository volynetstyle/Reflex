import { getCurrentComputedInternal } from "../internal";
import type { ReactiveNode } from "../reactivity";
import {
  readPropagateStackStats,
  readShouldRecomputeStackStats,
  resetRuntimeWalkerStackStats,
  type RuntimeWalkerStackStats,
} from "../reactivity/walkers";
import {
  snapshotDebugContext,
  labelDebugNode,
  snapshotDebugNode,
  readDebugHistory,
  clearDebugHistory,
  configureDebugContext,
  observeDebugContext,
} from "./debug.impl";
import type {
  RuntimeDebugOptions,
  RuntimeDebugContextSnapshot,
  RuntimeDebugEvent,
  RuntimeDebugListener,
  RuntimeDebugNodeSnapshot,
} from "./debug.types";

const noopUnsubscribe = () => {};
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

export interface RuntimeSubtle {
  readonly enabled: boolean;
  clearHistory(): void;
  configure(options?: RuntimeDebugOptions): RuntimeDebugContextSnapshot | undefined;
  context(): RuntimeDebugContextSnapshot | undefined;
  currentComputed(): ReactiveNode | undefined;
  history(): RuntimeDebugEvent[];
  label<T extends ReactiveNode>(node: T, label: string | null | undefined): T;
  observe(listener: RuntimeDebugListener): () => void;
  snapshot(node: ReactiveNode): RuntimeDebugNodeSnapshot | undefined;
  stackStats(): {
    shouldRecompute: RuntimeWalkerStackStats;
    propagate: RuntimeWalkerStackStats;
  } | undefined;
  resetStackStats(): void;
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

  currentComputed() {
    return getCurrentComputedInternal();
  },

  context() {
    if (!IS_DEV) return undefined;
    return snapshotDebugContext();
  },

  label(node, label) {
    if (!IS_DEV) return node;
    return labelDebugNode(node, label);
  },

  snapshot(node) {
    if (!IS_DEV) return undefined;
    return snapshotDebugNode(node);
  },

  history() {
    if (!IS_DEV) return [];
    return readDebugHistory();
  },

  clearHistory() {
    if (!IS_DEV) return;
    clearDebugHistory();
  },

  configure(options = {}) {
    if (!IS_DEV) return undefined;
    return configureDebugContext(undefined, options);
  },

  observe(listener) {
    if (!IS_DEV) return noopUnsubscribe;
    return observeDebugContext(undefined, listener);
  },

  stackStats() {
    if (!IS_DEV) return undefined;
    const shouldRecompute = readShouldRecomputeStackStats().shouldRecompute;
    const propagate = readPropagateStackStats().propagate;
    return {
      shouldRecompute,
      propagate,
    };
  },

  resetStackStats() {
    if (!IS_DEV) return;
    resetRuntimeWalkerStackStats();
  },
};
