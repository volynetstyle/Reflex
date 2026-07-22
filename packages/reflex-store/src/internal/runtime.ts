import {
  createProducer,
  createWatcher,
  disposeWatcher,
  runWatcher,
  type ProducerNode,
  type WatcherNode,
} from "@volynets/reflex-runtime/internal";
import type { Destructor, EffectFn, EffectOptions } from "../types";

export function createSignalNode<T>(payload: T): ProducerNode<T> {
  return createProducer(payload);
}

export function createWatcherRankedNode(
  compute: EffectFn,
  priority = 0,
): WatcherNode {
  const node = createWatcher(compute);
  (node as WatcherNode & { priority?: number }).priority = priority;
  return node;
}

export function effectRanked(
  fn: EffectFn,
  options: EffectOptions = {},
): Destructor {
  const node = createWatcherRankedNode(fn, options.priority ?? 0);
  runWatcher(node);
  return disposeWatcher.bind(null, node) as Destructor;
}
