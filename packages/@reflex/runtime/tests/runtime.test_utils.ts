import {
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  type ReactiveEdge,
  type EngineHooks,
  type ExecutionContext,
  WATCHER_INITIAL_STATE,
  createExecutionContext,
  resetDefaultContext,
} from "../src";
import { expect } from "vitest";
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

function expectLinearChainIntegrity(
  head: ReactiveEdge | null,
  next: (edge: ReactiveEdge) => ReactiveEdge | null,
  prev: (edge: ReactiveEdge) => ReactiveEdge | null,
): ReactiveEdge[] {
  const edges: ReactiveEdge[] = [];
  const seen = new Set<ReactiveEdge>();
  let current = head;
  let previous: ReactiveEdge | null = null;

  while (current !== null) {
    expect(seen.has(current)).toBe(false);
    seen.add(current);
    expect(prev(current)).toBe(previous);
    edges.push(current);
    previous = current;
    current = next(current);
  }

  return edges;
}

export function expectNodeGraphIntegrity(node: ReactiveNode): void {
  const incoming = expectLinearChainIntegrity(
    node.firstIn,
    (edge) => edge.nextIn,
    (edge) => edge.prevIn,
  );
  const outgoing = expectLinearChainIntegrity(
    node.firstOut,
    (edge) => edge.nextOut,
    (edge) => edge.prevOut,
  );

  expect(node.lastIn).toBe(incoming.at(-1) ?? null);
  expect(node.lastOut).toBe(outgoing.at(-1) ?? null);

  for (const edge of incoming) {
    expect(edge.to).toBe(node);
    expect(edge.from).toBeTruthy();
  }

  for (const edge of outgoing) {
    expect(edge.from).toBe(node);
    expect(edge.to).toBeTruthy();
  }

  if (node.depsTail !== null) {
    expect(incoming.includes(node.depsTail)).toBe(true);
  }
}
