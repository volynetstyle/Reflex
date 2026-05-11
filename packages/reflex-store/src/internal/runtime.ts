import {
  disposeWatcher,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  runWatcher,
  WATCHER_INITIAL_STATE,
} from "@volynets/reflex-runtime";
import type { Destructor, EffectFn, EffectOptions } from "../types";

export function createSignalNode<T>(payload: T): ReactiveNode<T> {
  return new ReactiveNode<T>(payload, null, PRODUCER_INITIAL_STATE);
}

export function createWatcherRankedNode(
  compute: EffectFn,
  priority = 0,
): ReactiveNode<void | Destructor> {
  const node = new ReactiveNode<void | Destructor>(
    undefined,
    compute,
    WATCHER_INITIAL_STATE,
  );
  (node as ReactiveNode<void | Destructor> & { priority?: number }).priority =
    priority;
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
