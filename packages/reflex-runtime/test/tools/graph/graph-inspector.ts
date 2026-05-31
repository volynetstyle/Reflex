import { expect } from "vitest";
import type { ReactiveNode } from "../../../src/internal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestReactiveEdge = any;

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

export function incomingEdges(node: ReactiveNode): TestReactiveEdge[] {
  const edges: TestReactiveEdge[] = [];

  for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
    edges.push(edge);
  }

  return edges;
}

export function outgoingEdges(node: ReactiveNode): TestReactiveEdge[] {
  const edges: TestReactiveEdge[] = [];

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    edges.push(edge);
  }

  return edges;
}

export function hasSubscriber(from: ReactiveNode, to: ReactiveNode): boolean {
  return outgoingSubscribers(from).includes(to);
}

function expectLinearChainIntegrity(
  head: TestReactiveEdge | null,
  next: (edge: TestReactiveEdge) => TestReactiveEdge | null,
  prev: (edge: TestReactiveEdge) => TestReactiveEdge | null,
): TestReactiveEdge[] {
  const edges: TestReactiveEdge[] = [];
  const seen = new Set<TestReactiveEdge>();
  let current = head;
  let previous: TestReactiveEdge | null = null;

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

  if (node.tailIn !== null) {
    expect(incoming.includes(node.tailIn)).toBe(true);
  }
}

export function expectGraphIntegrity(nodes: Iterable<ReactiveNode>): void {
  for (const node of nodes) {
    expectNodeGraphIntegrity(node);
  }
}

export function expectIncomingEdges(
  node: ReactiveNode,
  expected: TestReactiveEdge[],
): void {
  expect(incomingEdges(node)).toEqual(expected);
  expect(node.firstIn).toBe(expected[0] ?? null);
  expect(node.lastIn).toBe(expected.at(-1) ?? null);
}

export function expectIncomingPrefix(
  node: ReactiveNode,
  expectedPrefix: TestReactiveEdge[],
): void {
  expect(incomingEdges(node).slice(0, expectedPrefix.length)).toEqual(
    expectedPrefix,
  );
  expect(node.firstIn).toBe(expectedPrefix[0] ?? null);
}

export function expectOutgoingEdges(
  node: ReactiveNode,
  expected: TestReactiveEdge[],
): void {
  expect(outgoingEdges(node)).toEqual(expected);
  expect(node.firstOut).toBe(expected[0] ?? null);
  expect(node.lastOut).toBe(expected.at(-1) ?? null);
}

export function expecttailIn(
  node: ReactiveNode,
  expected: TestReactiveEdge | null,
): void {
  expect(node.tailIn).toBe(expected);
}

export function expectSources(
  node: ReactiveNode,
  expected: ReactiveNode[],
): void {
  expect(incomingSources(node)).toEqual(expected);
}

export function expectSubscriber(from: ReactiveNode, to: ReactiveNode): void {
  expect(hasSubscriber(from, to)).toBe(true);
}

export function expectSubscribers(
  from: ReactiveNode,
  expected: ReactiveNode[],
): void {
  expect(outgoingSubscribers(from)).toEqual(expected);
}

export function expectNoSubscriber(from: ReactiveNode, to: ReactiveNode): void {
  expect(hasSubscriber(from, to)).toBe(false);
}
