import {
  Both,
  CONSUMER_INITIAL_STATE,
  Changed,
  currentConsumer,
  emitNodeInvalidated,
  getActiveRuntimeContext,
  propagationScopeDepth,
  unlinkAllSources,
  disposeNode,
  type ConsumerNode,
  type ReactiveNode,
  type RuntimeContext,
  type WatcherNode,
} from "@runtime/kernel";

/**
 * Runtime integration contract: semantic operations for sibling packages
 * (store, scheduler, framework, DOM, async, facade). Callers state an intent;
 * the runtime owns the registers, flags and topology that implement it.
 * The permitted cross-package surface is enforced by
 * `scripts/check-package-boundaries.mjs` at the repository root.
 */

/** True while a reactive computation is collecting dependencies. */
export function isTracking(): boolean {
  return currentConsumer !== null;
}

/**
 * True when `context` is outside propagation and outside tracked evaluation.
 * Resolves the active register bank or the saved one; callers never read
 * context fields, which may be stale while that context is active.
 */
export function isContextSettled(
  context: RuntimeContext = getActiveRuntimeContext(),
): boolean {
  if (context !== getActiveRuntimeContext()) {
    return (
      context.propagationScopeDepth === 0 && context.currentConsumer === null
    );
  }

  return propagationScopeDepth === 0 && currentConsumer === null;
}

/** True when some consumer currently depends on `node`. */
export function hasObservers(node: ReactiveNode): boolean {
  return node.firstOut !== null;
}

/**
 * Disposes `node` when nothing observes it. The observer check and the
 * topology change are one operation. Returns whether the node was disposed.
 */
export function disposeNodeIfUnobserved(node: ReactiveNode): boolean {
  if (node.firstOut !== null) return false;
  disposeNode(node);
  return true;
}

/**
 * Returns an unobserved consumer to its never-evaluated state while keeping
 * its compute function, so a later read evaluates it from scratch. Returns
 * whether the consumer was suspended.
 */
export function suspendConsumerIfUnobserved<T>(node: ConsumerNode<T>): boolean {
  if (node.firstOut !== null) return false;
  unlinkAllSources(node);
  node.state = CONSUMER_INITIAL_STATE;
  node.payload = undefined as T;
  return true;
}

/** True when a watcher or consumer holds an invalidation it has not validated. */
export function hasPendingValidation(node: ReactiveNode): boolean {
  return (node.state & Both) !== 0;
}

/** True when a watcher was disposed and must not run again. */
export function isWatcherDisposed(node: WatcherNode): boolean {
  return node.compute === undefined;
}

/**
 * Decides whether a watcher whose run threw needs a later retry. Callback and
 * cleanup failures recover to clean; a failed dependency validation stays
 * dirty and must be retried by the next explicit drain.
 */
export function shouldRetryWatcherAfterFailure(node: WatcherNode): boolean {
  return (node.state & Both) !== 0;
}

/**
 * Forces the next run of `node` to execute its callback, then notifies the
 * host through the invalidation hook as a push invalidation would.
 */
export function invalidateWatcher(node: WatcherNode): void {
  node.state |= Changed;
  emitNodeInvalidated(node);
}
