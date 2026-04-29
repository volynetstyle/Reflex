import { expect } from "vitest";
import { ReactiveNode } from "../../src";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReactiveEdge = any;

export function incomingSources(node: ReactiveNode): ReactiveNode[] {
  const sources: ReactiveNode[] = [];

  for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
    sources.push(edge.from);
  }

  return sources;
}

export function outgoingSubscribers(node: ReactiveNode): ReactiveNode[] {
  const subscribers: ReactiveNode[] = [];

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    subscribers.push(edge.to);
  }

  return subscribers;
}

export function hasSubscriber(from: ReactiveNode, to: ReactiveNode): boolean {
  return outgoingSubscribers(from).includes(to);
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

  if (node.lastInTail !== null) {
    expect(incoming.includes(node.lastInTail)).toBe(true);
  }
}

export function expectGraphIntegrity(nodes: Iterable<ReactiveNode>): void {
  for (const node of nodes) {
    expectNodeGraphIntegrity(node);
  }
}

export function expectSources(
  node: ReactiveNode,
  expected: ReactiveNode[],
): void {
  expect(incomingSources(node)).toEqual(expected);
}

export function expectSubscriber(
  from: ReactiveNode,
  to: ReactiveNode,
): void {
  expect(hasSubscriber(from, to)).toBe(true);
}

export function expectNoSubscriber(
  from: ReactiveNode,
  to: ReactiveNode,
): void {
  expect(hasSubscriber(from, to)).toBe(false);
}
