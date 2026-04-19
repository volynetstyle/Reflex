import { describe, expect, it } from "vitest";
import {
  ReactiveNodeState,
  ReactiveNode,
  restoreContext,
  saveContext,
  setOptions,
} from "../src";
import {
  linkEdge,
  ReactiveEdge,
  trackReadActive,
  unlinkEdge,
  reuseIncomingEdgeFromSuffixOrCreate,
} from "../src/reactivity";

function createNode(kind: ReactiveNodeState = ReactiveNodeState.Producer) {
  return new ReactiveNode(undefined, null, kind);
}

describe("Reactive graph - edge wiring", () => {
  it("creates reactive edges and wires both intrusive lists", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const target = createNode(ReactiveNodeState.Consumer);

    const edge = linkEdge(source, target);

    expect(edge).toBeInstanceOf(ReactiveEdge);
    expect(edge.from).toBe(source);
    expect(edge.to).toBe(target);
    expect(source.firstOut).toBe(edge);
    expect(source.lastOut).toBe(edge);
    expect(target.firstIn).toBe(edge);
    expect(target.lastIn).toBe(edge);
  });

  it("keeps lastOutTail separate from the physical incoming tail when unlinking", () => {
    const a = createNode(ReactiveNodeState.Producer);
    const b = createNode(ReactiveNodeState.Producer);
    const c = createNode(ReactiveNodeState.Producer);
    const target = createNode(ReactiveNodeState.Consumer);

    const ab = linkEdge(a, target);
    const bb = linkEdge(b, target);
    const cb = linkEdge(c, target);

    target.lastOutTail = bb;
    unlinkEdge(cb);

    expect(target.lastOutTail).toBe(bb);
    expect(target.lastIn).toBe(bb);
    expect(target.firstIn).toBe(ab);
    expect(ab.nextIn).toBe(bb);
    expect(bb.prevIn).toBe(ab);
    expect(bb.nextIn).toBeNull();
  });

  it("repositions a reused incoming edge without corrupting the true tail", () => {
    const a = createNode(ReactiveNodeState.Producer);
    const b = createNode(ReactiveNodeState.Producer);
    const c = createNode(ReactiveNodeState.Producer);
    const target = createNode(ReactiveNodeState.Consumer);

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
    const a = createNode(ReactiveNodeState.Producer);
    const b = createNode(ReactiveNodeState.Producer);
    const c = createNode(ReactiveNodeState.Producer);
    const target = createNode(ReactiveNodeState.Consumer);
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

    target.lastOutTail = ab;
    trackReadActive(c, target);
    trackReadActive(c, target);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      source: c,
      consumer: target,
      prev: ab,
      nextExpected: bb,
    });
    expect(target.lastOutTail).toBe(cb);
    expect(ab.nextIn).toBe(cb);
    expect(cb.prevIn).toBe(ab);
    restoreContext(snapshot);
  });
});
