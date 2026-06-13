import { describe, expect, it } from "vitest";
import {
  ReactiveNode,
  restoreContext,
  saveContext,
  setRuntimeContextOptions,
} from "../../runtime.test_utils";
import type { ReactiveNodeState } from "../../../src/kernel";
import {
  Consumer,
  Producer,
  linkEdge,
  moveIncomingEdgeAfterUnchecked,
  moveLastIncomingEdgeAfterEdgeUnchecked,
  moveLastIncomingEdgeToFrontUnchecked,
  moveMiddleIncomingEdgeAfterEdgeUnchecked,
  moveNonHeadIncomingEdgeToFrontUnchecked,
  reuseIncomingEdgeFromSuffixOrCreate,
  setTrackingEpoch,
  trackRead,
  unlinkEdge,
} from "../../../src/kernel";
import type { ReactiveEdge } from "../../../src/kernel";
import {
  expectGraphIntegrity,
  expectIncomingEdges,
  expecttailIn,
  expectOutgoingEdges,
} from "../../runtime.test_utils";

function createNode(kind: ReactiveNodeState = Producer) {
  return new ReactiveNode(undefined, null, kind);
}

function createIncomingList() {
  const a = createNode(Producer);
  const b = createNode(Producer);
  const c = createNode(Producer);
  const d = createNode(Producer);
  const target = createNode(Consumer);

  const ab = linkEdge(a, target);
  const bb = linkEdge(b, target);
  const cb = linkEdge(c, target);
  const db = linkEdge(d, target);

  return { a, b, c, d, target, ab, bb, cb, db };
}

/** Covers low-level intrusive edge-list wiring and reuse invariants. */
describe("Reactive runtime - edge wiring", () => {
  it("wires multi-edge outgoing and incoming lists bidirectionally", () => {
    const source = createNode(Producer);
    const left = createNode(Consumer);
    const middle = createNode(Consumer);
    const right = createNode(Consumer);

    const leftEdge = linkEdge(source, left);
    const middleEdge = linkEdge(source, middle);
    const rightEdge = linkEdge(source, right);

    expectOutgoingEdges(source, [leftEdge, middleEdge, rightEdge]);
    expectIncomingEdges(left, [leftEdge]);
    expectIncomingEdges(middle, [middleEdge]);
    expectIncomingEdges(right, [rightEdge]);
    expectGraphIntegrity([source, left, middle, right]);
  });

  it("creates reactive edges and wires both intrusive lists", () => {
    const source = createNode(Producer);
    const target = createNode(Consumer);

    const edge = linkEdge(source, target);

    expect(edge.from).toBe(source);
    expect(edge.to).toBe(target);
    expectOutgoingEdges(source, [edge]);
    expectIncomingEdges(target, [edge]);
    expectGraphIntegrity([source, target]);
  });

  it("keeps direct subscriber branches wired through ordinary edge lists", () => {
    const source = createNode(Producer);
    const left = createNode(Consumer);
    const right = createNode(Consumer);
    const leftChild = createNode(Consumer);
    const rightChild = createNode(Consumer);

    const leftEdge = linkEdge(source, left);
    const rightEdge = linkEdge(source, right);

    expectOutgoingEdges(source, [leftEdge, rightEdge]);

    const leftChildEdge = linkEdge(left, leftChild);
    expectOutgoingEdges(left, [leftChildEdge]);

    const rightChildEdge = linkEdge(right, rightChild);
    expectOutgoingEdges(right, [rightChildEdge]);

    unlinkEdge(leftChildEdge);
    expectOutgoingEdges(left, []);

    unlinkEdge(leftEdge);
    expectOutgoingEdges(source, [rightEdge]);

    unlinkEdge(rightChildEdge);
    expectOutgoingEdges(right, []);
    expectGraphIntegrity([source, left, right, leftChild, rightChild]);
  });

  it("unlinks outgoing head, middle, and tail without corrupting neighbors", () => {
    const source = createNode(Producer);
    const left = createNode(Consumer);
    const middle = createNode(Consumer);
    const right = createNode(Consumer);

    const leftEdge = linkEdge(source, left);
    const middleEdge = linkEdge(source, middle);
    const rightEdge = linkEdge(source, right);

    unlinkEdge(middleEdge);

    expectOutgoingEdges(source, [leftEdge, rightEdge]);
    expectIncomingEdges(middle, []);

    unlinkEdge(leftEdge);

    expectOutgoingEdges(source, [rightEdge]);

    unlinkEdge(rightEdge);

    expectOutgoingEdges(source, []);
    expectGraphIntegrity([source, left, middle, right]);
  });

  it("keeps tailIn separate from the physical incoming tail when unlinking", () => {
    const a = createNode(Producer);
    const b = createNode(Producer);
    const c = createNode(Producer);
    const target = createNode(Consumer);

    const ab = linkEdge(a, target);
    const bb = linkEdge(b, target);
    const cb = linkEdge(c, target);

    target.tailIn = bb;
    unlinkEdge(cb);

    expecttailIn(target, bb);
    expectIncomingEdges(target, [ab, bb]);
    expectGraphIntegrity([a, b, c, target]);
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
    expectIncomingEdges(target, [ab, cb, bb]);
    expectOutgoingEdges(c, [cb]);
    expectGraphIntegrity([a, b, c, target]);
  });

  it("moves middle and tail incoming edges through unchecked fast paths", () => {
    const a = createNode(Producer);
    const b = createNode(Producer);
    const c = createNode(Producer);
    const d = createNode(Producer);
    const target = createNode(Consumer);

    const ab = linkEdge(a, target);
    const bb = linkEdge(b, target);
    const cb = linkEdge(c, target);
    const db = linkEdge(d, target);

    moveMiddleIncomingEdgeAfterEdgeUnchecked(target, cb, ab);
    expectIncomingEdges(target, [ab, cb, bb, db]);

    moveNonHeadIncomingEdgeToFrontUnchecked(target, bb);
    expectIncomingEdges(target, [bb, ab, cb, db]);

    moveLastIncomingEdgeAfterEdgeUnchecked(target, db, ab);
    expectIncomingEdges(target, [bb, ab, db, cb]);

    moveLastIncomingEdgeToFrontUnchecked(target, cb);
    expectIncomingEdges(target, [cb, bb, ab, db]);
    expectGraphIntegrity([a, b, c, d, target]);
  });

  it.each([
    {
      name: "A B C D, move C after A -> A C B D",
      move({ target, ab, cb }: ReturnType<typeof createIncomingList>) {
        moveMiddleIncomingEdgeAfterEdgeUnchecked(target, cb, ab);
      },
      expected({ ab, bb, cb, db }: ReturnType<typeof createIncomingList>) {
        return [ab, cb, bb, db];
      },
    },
    {
      name: "A B C D, move D after A -> A D B C",
      move({ target, ab, db }: ReturnType<typeof createIncomingList>) {
        moveLastIncomingEdgeAfterEdgeUnchecked(target, db, ab);
      },
      expected({ ab, bb, cb, db }: ReturnType<typeof createIncomingList>) {
        return [ab, db, bb, cb];
      },
    },
    {
      name: "A B C D, move D front -> D A B C",
      move({ target, db }: ReturnType<typeof createIncomingList>) {
        moveLastIncomingEdgeToFrontUnchecked(target, db);
      },
      expected({ ab, bb, cb, db }: ReturnType<typeof createIncomingList>) {
        return [db, ab, bb, cb];
      },
    },
    {
      name: "A B C D, move B front -> B A C D",
      move({ target, bb }: ReturnType<typeof createIncomingList>) {
        moveNonHeadIncomingEdgeToFrontUnchecked(target, bb);
      },
      expected({ ab, bb, cb, db }: ReturnType<typeof createIncomingList>) {
        return [bb, ab, cb, db];
      },
    },
    {
      name: "A B C D, move C after D -> A B D C",
      move({ target, cb, db }: ReturnType<typeof createIncomingList>) {
        moveMiddleIncomingEdgeAfterEdgeUnchecked(target, cb, db);
      },
      expected({ ab, bb, cb, db }: ReturnType<typeof createIncomingList>) {
        return [ab, bb, db, cb];
      },
    },
  ])("$name", ({ move, expected }) => {
    const graph = createIncomingList();

    move(graph);

    expectIncomingEdges(graph.target, expected(graph));
    expectGraphIntegrity([graph.a, graph.b, graph.c, graph.d, graph.target]);
  });

  it("keeps incoming edge moves inert for no-op caller shapes", () => {
    const graph = createIncomingList();

    moveIncomingEdgeAfterUnchecked(graph.target, graph.bb, graph.ab);
    expectIncomingEdges(graph.target, [graph.ab, graph.bb, graph.cb, graph.db]);

    moveIncomingEdgeAfterUnchecked(graph.target, graph.cb, graph.cb);
    expectIncomingEdges(graph.target, [graph.ab, graph.bb, graph.cb, graph.db]);

    expectGraphIntegrity([
      graph.a,
      graph.b,
      graph.c,
      graph.d,
      graph.target,
    ]);
  });

  it("handles tiny suffix edge reuse before the execution-context fallback seam", () => {
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
    setRuntimeContextOptions({
      readTrackingStrategy(source, consumer, prev, nextExpected) {
        calls.push({ source, consumer, prev, nextExpected });
        return reuseIncomingEdgeFromSuffixOrCreate(
          source,
          consumer,
          prev,
          nextExpected,
        );
      },
    });

    target.tailIn = ab;
    trackRead(c, target);
    trackRead(c, target);

    expect(calls).toEqual([]);
    expecttailIn(target, cb);
    expectIncomingEdges(target, [ab, cb, bb]);
    expectGraphIntegrity([a, b, c, target]);
    restoreContext(snapshot);
  });

  it("routes full fallback edge reuse through the execution-context seam", () => {
    const a = createNode(Producer);
    const b = createNode(Producer);
    const c = createNode(Producer);
    const d = createNode(Producer);
    const e = createNode(Producer);
    const f = createNode(Producer);
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
    const db = linkEdge(d, target);
    const eb = linkEdge(e, target);
    const fb = linkEdge(f, target);
    const snapshot = saveContext();
    setRuntimeContextOptions({
      readTrackingStrategy(source, consumer, prev, nextExpected) {
        calls.push({ source, consumer, prev, nextExpected });
        return reuseIncomingEdgeFromSuffixOrCreate(
          source,
          consumer,
          prev,
          nextExpected,
        );
      },
    });

    target.tailIn = ab;
    trackRead(e, target);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      source: e,
      consumer: target,
      prev: ab,
      nextExpected: bb,
    });
    expecttailIn(target, eb);
    expectIncomingEdges(target, [ab, eb, bb, cb, db, fb]);
    expectGraphIntegrity([a, b, c, d, e, f, target]);
    restoreContext(snapshot);
  });

  it("reuses the incoming tail before the execution-context fallback seam", () => {
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
    const snapshot = saveContext();

    const ab = linkEdge(a, target);
    const bb = linkEdge(b, target);
    const cb = linkEdge(c, target);

    setRuntimeContextOptions({
      readTrackingStrategy(source, consumer, prev, nextExpected) {
        calls.push({ source, consumer, prev, nextExpected });
        return reuseIncomingEdgeFromSuffixOrCreate(
          source,
          consumer,
          prev,
          nextExpected,
        );
      },
    });

    target.tailIn = ab;
    trackRead(c, target);

    expect(calls).toEqual([]);
    expecttailIn(target, cb);
    expectIncomingEdges(target, [ab, cb, bb]);
    expectGraphIntegrity([a, b, c, target]);
    restoreContext(snapshot);
  });

  it("keeps small stale suffixes reusable after a suffix miss", () => {
    const target = createNode(Consumer);
    const staleSources = Array.from({ length: 31 }, () => createNode(Producer));
    const fresh = createNode(Producer);

    for (const source of staleSources) {
      linkEdge(source, target, target.lastIn);
    }

    const firstStaleEdge = target.firstIn;
    const freshEdge = reuseIncomingEdgeFromSuffixOrCreate(
      fresh,
      target,
      null,
      firstStaleEdge,
      1,
    );

    expectIncomingEdges(target, [
      freshEdge,
      ...staleSources.map((source) => source.firstOut),
    ]);
    for (const source of staleSources) {
      expectOutgoingEdges(source, [source.firstOut]);
    }
    expectGraphIntegrity([target, fresh, ...staleSources]);
  });

  it("eagerly detaches large stale suffixes after a suffix miss", () => {
    const target = createNode(Consumer);
    const staleSources = Array.from({ length: 32 }, () => createNode(Producer));
    const fresh = createNode(Producer);

    for (const source of staleSources) {
      linkEdge(source, target, target.lastIn);
    }

    const firstStaleEdge = target.firstIn;
    const freshEdge = reuseIncomingEdgeFromSuffixOrCreate(
      fresh,
      target,
      null,
      firstStaleEdge,
      1,
    );

    expectIncomingEdges(target, [freshEdge]);
    for (const source of staleSources) {
      expectOutgoingEdges(source, []);
    }
    expectGraphIntegrity([target, fresh, ...staleSources]);
  });

  it("eagerly detaches only the stale suffix after a retained prefix", () => {
    const target = createNode(Consumer);
    const retained = createNode(Producer);
    const staleSources = Array.from({ length: 32 }, () => createNode(Producer));
    const fresh = createNode(Producer);
    const retainedEdge = linkEdge(retained, target);

    for (const source of staleSources) {
      linkEdge(source, target, target.lastIn);
    }

    const firstStaleEdge = retainedEdge.nextIn;
    target.tailIn = retainedEdge;

    const freshEdge = reuseIncomingEdgeFromSuffixOrCreate(
      fresh,
      target,
      retainedEdge,
      firstStaleEdge,
      1,
    );

    expectIncomingEdges(target, [retainedEdge, freshEdge]);
    expectOutgoingEdges(retained, [retainedEdge]);
    for (const source of staleSources) {
      expectOutgoingEdges(source, []);
    }
    expectGraphIntegrity([target, retained, fresh, ...staleSources]);
  });

  it("keeps prefix duplicate tracking reads structurally inert", () => {
    const a = createNode(Producer);
    const b = createNode(Producer);
    const target = createNode(Consumer);
    const calls: Array<{
      source: ReactiveNode;
      consumer: ReactiveNode;
      prev: ReactiveEdge | null;
      nextExpected: ReactiveEdge | null;
    }> = [];
    const snapshot = saveContext();

    setRuntimeContextOptions({
      readTrackingStrategy(source, consumer, prev, nextExpected) {
        calls.push({ source, consumer, prev, nextExpected });
        return reuseIncomingEdgeFromSuffixOrCreate(
          source,
          consumer,
          prev,
          nextExpected,
        );
      },
    });

    const ab = linkEdge(a, target, null, 1);
    const bb = linkEdge(b, target, ab, 1);

    target.tailIn = ab;
    setTrackingEpoch(2);

    trackRead(b, target);
    trackRead(a, target);
    trackRead(b, target);

    expect(calls).toEqual([]);
    expectIncomingEdges(target, [ab, bb]);
    expecttailIn(target, bb);
    expectOutgoingEdges(a, [ab]);
    expectOutgoingEdges(b, [bb]);
    expectGraphIntegrity([a, b, target]);

    restoreContext(snapshot);
  });

  it("does not roll back tracking stamps when restoring context", () => {
    const a = createNode(Producer);
    const target = createNode(Consumer);
    const snapshot = saveContext();

    setTrackingEpoch(1);
    const staleSnapshot = saveContext();
    const edge = linkEdge(a, target, null, 1);
    setTrackingEpoch(2);
    restoreContext(staleSnapshot);
    target.tailIn = null;

    trackRead(a, target);

    expecttailIn(target, edge);
    expectIncomingEdges(target, [edge]);
    restoreContext(snapshot);
  });
});
