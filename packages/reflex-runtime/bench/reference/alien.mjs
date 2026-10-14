// Reference adapter: the bench `rt` API over alien-signals.
//
//   node bench/reference/build.mjs   ->  .cache/bench/reference-alien/runtime.mjs
//   node bench/compare.mjs --candidate bundle:.cache/bench/reference-alien \
//        --workloads "^(A\.(read|write|track)|B\.)"
//
// alien-signals implements the same push-dirty / pull-validate model with
// cursor-based dependency tracking. Running Reflex workloads on it gives an
// external reference for the cost floor of that model. Only signal/computed
// workloads are comparable: alien effects run synchronously and have no host
// queue, contexts or invalidation hooks, so watcher workloads are excluded.
import { computed, signal, startBatch, endBatch } from "alien-signals";

export const ConsumerReadMode = { lazy: 0, eager: 1 };

export const createProducer = (value) => signal(value);
export const readProducer = (node) => node();
export const writeProducer = (node, value) => node(value);
export const createConsumer = (compute) => computed(() => compute());
export const readConsumer = (node) => node();
export const enterReactiveBatch = startBatch;
export const leaveReactiveBatch = endBatch;

// Context and host plumbing has no counterpart; the comparable workloads only
// reset or leave the default context.
export function resetRuntimeContext() {}
export function configureRuntimeContext() {}
export function getActiveRuntimeContext() {
  return null;
}
export function createRuntimeContext() {
  return null;
}
export function runWithRuntimeContext(_context, fn) {
  return fn();
}

function unsupported(name) {
  return () => {
    throw new Error(`${name} has no alien-signals counterpart in this adapter`);
  };
}
export const createWatcher = unsupported("createWatcher");
export const runWatcher = unsupported("runWatcher");
export const disposeWatcher = unsupported("disposeWatcher");
export const disposeNode = unsupported("disposeNode");
