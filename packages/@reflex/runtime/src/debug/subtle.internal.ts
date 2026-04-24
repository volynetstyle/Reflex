import { getCurrentComputedInternal } from "../internal";
import {
  Watcher as WatcherFlag,
  type ReactiveNode,
} from "../reactivity";
import { untracked } from "../protocol";
import {
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

export type State<T = unknown> = ReactiveNode<T> & { compute: null };
export type Computed<T = unknown> = ReactiveNode<T> & { compute: () => T };
export type Watcher<T = unknown> = ReactiveNode<T> & { compute: () => T };

function isWatcherNode(node: ReactiveNode): node is Watcher {
  return (node.state & WatcherFlag) !== 0;
}

function isComputedNode(node: ReactiveNode | null | undefined): node is Computed {
  return node !== null && node !== undefined && !isWatcherNode(node) && node.compute !== null;
}

function collectSources(node: ReactiveNode): ReactiveNode[] {
  const sources: ReactiveNode[] = [];

  for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
    sources.push(edge.from);
  }

  return sources;
}

function collectSinks(node: ReactiveNode): ReactiveNode[] {
  const sinks: ReactiveNode[] = [];

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    sinks.push(edge.to);
  }

  return sinks;
}

export interface RuntimeSubtle {
  readonly enabled: boolean;
  clearHistory(): void;
  configure(options?: RuntimeDebugOptions): RuntimeDebugContextSnapshot | undefined;
  context(): RuntimeDebugContextSnapshot | undefined;
  currentComputed(): Computed | undefined;
  history(): RuntimeDebugEvent[];
  hasSinks(s: State | Computed): boolean;
  hasSources(s: Computed | Watcher): boolean;
  introspectSinks(s: State | Computed): (Computed | Watcher)[];
  introspectSources(s: Computed | Watcher): (State | Computed)[];
  label<T extends ReactiveNode>(node: T, label: string | null | undefined): T;
  observe(listener: RuntimeDebugListener): () => void;
  snapshot(node: ReactiveNode): RuntimeDebugNodeSnapshot | undefined;
  stackStats(): {
    shouldRecompute: RuntimeWalkerStackStats;
    propagate: RuntimeWalkerStackStats;
  } | undefined;
  resetStackStats(): void;
  untrack<T>(cb: () => T): T;
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

  untrack(cb) {
    return untracked(cb);
  },

  currentComputed() {
    const node = getCurrentComputedInternal();
    return isComputedNode(node) ? node : undefined;
  },

  introspectSources(node) {
    return collectSources(node) as (State | Computed)[];
  },

  introspectSinks(node) {
    return collectSinks(node).filter(
      (sink): sink is Computed | Watcher => sink.compute !== null,
    );
  },

  hasSinks(node) {
    return node.firstOut !== null;
  },

  hasSources(node) {
    return node.firstIn !== null;
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
  },

  resetStackStats() {
    if (!IS_DEV) return;
    resetRuntimeWalkerStackStats();
  },
};
