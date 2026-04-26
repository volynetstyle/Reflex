import { describe, expect, it } from "vitest";
import { ReactiveNode, restoreContext, saveContext, setOptions } from "../src";
import type {
  ReactiveNodeState} from "../src/reactivity";
import {
  linkEdge,
  ReactiveEdge,
  trackReadActive,
  unlinkEdge,
  reuseIncomingEdgeFromSuffixOrCreate,
  Consumer,
  Producer,
  setTrackingVersion
} from "../src/reactivity";

function createNode(kind: ReactiveNodeState = Producer) {
  return new ReactiveNode(undefined, null, kind);
}

describe("Reactive graph - edge wiring", () => {
  it("creates reactive edges and wires both intrusive lists", () => {
    const source = createNode(Producer);
    const target = createNode(Consumer);

    const edge = linkEdge(source, target);

    expect(edge).toBeInstanceOf(ReactiveEdge);
    expect(edge.from).toBe(source);
    expect(edge.to).toBe(target);
    expect(source.firstOut).toBe(edge);
    expect(source.lastOut).toBe(edge);
    expect(target.firstIn).toBe(edge);
    expect(target.lastIn).toBe(edge);
  });

  it("keeps direct subscriber branches wired through ordinary edge lists", () => {
    const source = createNode(Producer);
    const left = createNode(Consumer);
    const right = createNode(Consumer);
    const leftChild = createNode(Consumer);
    const rightChild = createNode(Consumer);

    const leftEdge = linkEdge(source, left);
    linkEdge(source, right);

    expect(source.firstOut?.to).toBe(left);
    expect(source.firstOut?.nextOut?.to).toBe(right);

    const leftChildEdge = linkEdge(left, leftChild);
    expect(left.firstOut).toBe(leftChildEdge);

    const rightChildEdge = linkEdge(right, rightChild);
    expect(right.firstOut).toBe(rightChildEdge);

    unlinkEdge(leftChildEdge);
    expect(left.firstOut).toBeNull();

    unlinkEdge(leftEdge);
    expect(source.firstOut?.to).toBe(right);

    unlinkEdge(rightChildEdge);
    expect(right.firstOut).toBeNull();
  });

  it("keeps lastInTail separate from the physical incoming tail when unlinking", () => {
    const a = createNode(Producer);
    const b = createNode(Producer);
    const c = createNode(Producer);
    const target = createNode(Consumer);

    const ab = linkEdge(a, target);
    const bb = linkEdge(b, target);
    const cb = linkEdge(c, target);

    target.lastInTail = bb;
    unlinkEdge(cb);

    expect(target.lastInTail).toBe(bb);
    expect(target.lastIn).toBe(bb);
    expect(target.firstIn).toBe(ab);
    expect(ab.nextIn).toBe(bb);
    expect(bb.prevIn).toBe(ab);
    expect(bb.nextIn).toBeNull();
  });

  it("repositions a reused incoming edge without corrupting the true tail", () => {
    const a = createNode(Producer);
    const b = createNode(Producer);
    const c = createNode(Producer);
    const target = createNode(Consumer);

    const ab = linkEdge(a, target);
    const bb = linkEdge(b, target);
    const cb = linkEdge(c, target);

    const reused = reuseIncomingEdgeFromSuffixOrCreate(c, target, ab, bb);

    expect(reused).toBe(cb);
    expect(target.firstIn).toBe(ab);
    expect(ab.nextIn).toBe(cb);
    expect(cb.prevIn).toBe(ab);
    expect(cb.nextIn).toBe(bb);
    expect(bb.prevIn).toBe(cb);
    expect(target.lastIn).toBe(bb);
  });

  it("routes fallback edge reuse through the execution-context seam", () => {
    const a = createNode(Producer);
    const b = createNode(Producer);
    const c = createNode(Producer);
    const target = createNode(Consumer);
    const calls: Array<{
      source: ReactiveNode;
      consumer: ReactiveNode;
      prev: ReactiveEdge | null;
      nextExpected: ReactiveEdge | null;
    }> = [];

    const ab = linkEdge(a, target);
    const bb = linkEdge(b, target);
    const cb = linkEdge(c, target);
    const snapshot = saveContext();
    setOptions({
      trackReadFallback(source, consumer, prev, nextExpected) {
        calls.push({ source, consumer, prev, nextExpected });
        return reuseIncomingEdgeFromSuffixOrCreate(
          source,
          consumer,
          prev,
          nextExpected,
        );
      },
    });

    target.lastInTail = ab;
    trackReadActive(c, target);
    trackReadActive(c, target);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      source: c,
      consumer: target,
      prev: ab,
      nextExpected: bb,
    });
    expect(target.lastInTail).toBe(cb);
    expect(ab.nextIn).toBe(cb);
    expect(cb.prevIn).toBe(ab);
    restoreContext(snapshot);
  });

  it("does not roll back tracking stamps when restoring context", () => {
    const a = createNode(Producer);
    const target = createNode(Consumer);
    const snapshot = saveContext();

    setTrackingVersion(1);
    const staleSnapshot = saveContext();
    const edge = linkEdge(a, target, null, 1);
    setTrackingVersion(2);
    restoreContext(staleSnapshot);
    target.lastInTail = null;

    trackReadActive(a, target);

    expect(target.lastInTail).toBe(edge);
    restoreContext(snapshot);
  });
});
