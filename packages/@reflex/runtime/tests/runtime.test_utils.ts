import {
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  type EngineHooks,
  WATCHER_INITIAL_STATE,
} from "../src";
import runtime from "../src/reactivity/context";
import { UNINITIALIZED } from "../src/reactivity/shape/ReactiveNode";

export function resetRuntime(hooks: EngineHooks = {}): void {
  runtime.resetState();
  runtime.setHooks(hooks);
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
