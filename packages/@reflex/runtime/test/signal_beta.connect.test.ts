import { describe, expect, it } from "vitest";
import ReactiveNode from "../src/reactivity/shape/ReactiveNode";
import { ReactiveNodeState } from "../src/reactivity/shape/ReactiveMeta";
import {
  linkEdge,
  reuseOrCreateIncomingEdge,
  unlinkEdge,
} from "../src/reactivity/shape/methods/connect";

function createNode(kind: ReactiveNodeState = ReactiveNodeState.Producer) {
  return new ReactiveNode(undefined, null, kind);
}

describe("Reactive graph - edge wiring", () => {
  it("creates plain-object edges and wires both intrusive lists", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const target = createNode(ReactiveNodeState.Consumer);

    const edge = linkEdge(source, target);

    expect(Object.getPrototypeOf(edge)).toBe(Object.prototype);
    expect(edge.from).toBe(source);
    expect(edge.to).toBe(target);
    expect(source.firstOut).toBe(edge);
    expect(source.lastOut).toBe(edge);
    expect(target.firstIn).toBe(edge);
    expect(target.lastIn).toBe(edge);
  });

  it("keeps depsTail separate from the physical incoming tail when unlinking", () => {
    const a = createNode(ReactiveNodeState.Producer);
    const b = createNode(ReactiveNodeState.Producer);
    const c = createNode(ReactiveNodeState.Producer);
    const target = createNode(ReactiveNodeState.Consumer);

    const ab = linkEdge(a, target);
    const bb = linkEdge(b, target);
    const cb = linkEdge(c, target);

    target.depsTail = bb;
    unlinkEdge(cb);

    expect(target.depsTail).toBe(bb);
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

    const reused = reuseOrCreateIncomingEdge(c, target, ab, bb);

    expect(reused).toBe(cb);
    expect(target.firstIn).toBe(ab);
    expect(ab.nextIn).toBe(cb);
    expect(cb.prevIn).toBe(ab);
    expect(cb.nextIn).toBe(bb);
    expect(bb.prevIn).toBe(cb);
    expect(target.lastIn).toBe(bb);
  });
});
