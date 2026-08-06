import {
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  WATCHER_INITIAL_STATE,
  type ConsumerNode,
  type ProducerNode,
  type WatcherCleanup,
  type WatcherNode,
} from "@runtime/kernel";
import { defaultContext } from "@runtime/kernel/config";
import { devRecordNodeCreated } from "@runtime/kernel/dev";

/**
 * Callback function for a reactive effect (watcher).
 * Can optionally return a cleanup function that executes before the next run or upon node destruction.
 */
export type WatcherFn = () => void | WatcherCleanup;

/**
 * Creates a Signal node containing a mutable value.
 * Acts as a primary data source (Producer) in the reactivity graph.
 *
 * @template T The type of value stored within the signal.
 * @param payload The initial state/value of the signal.
 * @returns A `ReactiveNode` instance configured as a pure Producer.
 *
 * @example
 * const count = createProducer(0);
 */
export const createProducer = <T>(payload: T): ProducerNode<T> => {
  const node = new ReactiveNode<T>(
    payload,
    undefined,
    PRODUCER_INITIAL_STATE,
  ) as ProducerNode<T>;
  devRecordNodeCreated(node, defaultContext);
  return node;
};

/**
 * Creates a Computed node whose value depends on other reactive nodes.
 * Acts as both a Consumer (for upstream dependencies) and a Producer (for downstream dependents).
 * Caches the value and lazily recomputes it only when its dependencies change.
 *
 * @template T The type of value returned by the computation function.
 * @param fn A side-effect-free function that computes the value.
 * @returns A `ReactiveNode` instance configured as a lazy Consumer/Producer.
 *
 * @example
 * const doubled = createConsumer(() => count.get() * 2);
 */
export const createConsumer = <T>(callback: () => T): ConsumerNode<T> => {
  const node = new ReactiveNode<T>(
    undefined as T,
    callback,
    CONSUMER_INITIAL_STATE,
  ) as ConsumerNode<T>;
  devRecordNodeCreated(node, defaultContext);
  return node;
};

/**
 * Creates a Watcher node (Effect) used to execute side effects.
 * Acts as a terminal Consumer in the reactivity graph. Automatically schedules and
 * re-runs whenever any reactive nodes accessed inside the `compute` function change.
 *
 * @param compute The side-effect function to execute when dependencies change.
 * @returns A `ReactiveNode` instance configured as an active Consumer (Watcher).
 *
 * @example
 * const logger = createWatcher(() => console.log(count.get()));
 */
export const createWatcher = (callback: WatcherFn): WatcherNode => {
  const node = new ReactiveNode(
    undefined,
    callback,
    WATCHER_INITIAL_STATE,
  ) as WatcherNode;
  devRecordNodeCreated(node, defaultContext);
  return node;
};
