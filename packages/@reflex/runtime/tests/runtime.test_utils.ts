import {
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  type EngineHooks,
  type ExecutionContext,
  WATCHER_INITIAL_STATE,
  createExecutionContext,
  resetDefaultContext,
} from "../src";
import { UNINITIALIZED } from "../src/reactivity/shape/ReactiveNode";

/**
 * Reset the default context to a fresh instance with optional hooks.
 * Recommended for test isolation.
 */
export function resetRuntime(hooks: EngineHooks = {}): ExecutionContext {
  return resetDefaultContext(hooks);
}

export function createProducer<T>(value: T): ReactiveNode<T> {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

export function createConsumer<T>(compute: () => T): ReactiveNode<T> {
  return new ReactiveNode(UNINITIALIZED as T, compute, CONSUMER_INITIAL_STATE);
}

export function createWatcher(
  compute: () => void | (() => void),
): ReactiveNode<unknown> {
  return new ReactiveNode(null, compute, WATCHER_INITIAL_STATE);
}

export function incomingSources(node: ReactiveNode): ReactiveNode[] {
  const sources: ReactiveNode[] = [];

  for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
    sources.push(edge.from);
  }

  return sources;
}

export function hasSubscriber(from: ReactiveNode, to: ReactiveNode): boolean {
  for (let edge = from.firstOut; edge !== null; edge = edge.nextOut) {
    if (edge.to === to) return true;
  }

  return false;
}

export function createTestContext(hooks: EngineHooks = {}): ExecutionContext {
  return createExecutionContext(hooks);
}
