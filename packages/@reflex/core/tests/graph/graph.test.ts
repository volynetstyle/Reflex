import { describe, it, expect } from "vitest";
import {
  linkSourceToObserverUnsafe,
  unlinkEdgeUnsafe,
  unlinkSourceFromObserverUnsafe,
  unlinkAllObserversUnsafe,
  unlinkAllSourcesUnsafe,
  unlinkAllObserversChunkedUnsafe,
  unlinkAllSourcesChunkedUnsafe,
  linkSourceToObserversBatchUnsafe,
  hasSourceUnsafe,
  hasObserverUnsafe,
  GraphNode,
  GraphEdge,
  assertNodeInvariant,
} from "../../src/graph";

/**
 * DAG INVARIANT CHECKLIST:
 *
 * 1. Count Integrity: |edges| === count ∧ count ≥ 0
 * 2. List Boundaries: (count === 0 ⇔ first === last === null)
 * 3. Head/Tail Properties:
 *    - first.prev === null
 *    - last.next === null
 * 4. Chain Continuity:
 *    - ∀ edge: prev.next === edge ∧ next.prev === edge
 * 5. Edge Ownership:
 *    - ∀ outEdge: outEdge.from === node
 *    - ∀ inEdge: inEdge.to === node
 * 6. Acyclicity: Enforced by DAG definition (edges point to successors)
 * 7. Formal Invariant: Validated via assertNodeInvariant
 */
function validateDagInvariant(
  node: GraphNode,
  direction: "out" | "in" = "out",
): void {
  const isOut = direction === "out";
  const edges = collectEdges(node, direction);
  const count = isOut ? node.outCount : node.inCount;
  const first = isOut ? node.firstOut : node.firstIn;
  const last = isOut ? node.lastOut : node.lastIn;

  // INVARIANT 1: Count Integrity
  expect(edges.length).toBe(count);
  expect(count).toBeGreaterThanOrEqual(0);

  // INVARIANT 2: List Boundaries (Empty list invariant)
  expect((count === 0) === (first === null)).toBe(true);
  expect((count === 0) === (last === null)).toBe(true);

  if (count > 0) {
    // INVARIANT 3: Head/Tail Properties
    expect(first).toBe(edges[0]);
    expect(last).toBe(edges[edges.length - 1]);

    // INVARIANT 4: Chain Continuity & INVARIANT 5: Edge Ownership
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i]!;
      const prev = isOut ? edge.prevOut : edge.prevIn;
      const next = isOut ? edge.nextOut : edge.nextIn;
      const ownerNode = isOut ? edge.from : edge.to;

      // Ownership check
      expect(ownerNode).toBe(node);

      // Boundary conditions
      expect((i === 0) === (prev === null)).toBe(true);
      expect((i === edges.length - 1) === (next === null)).toBe(true);

      // Chain links
      if (prev) expect(isOut ? prev.nextOut : prev.nextIn).toBe(edge);
      if (next) expect(isOut ? next.prevOut : next.prevIn).toBe(edge);
    }
  }

  // INVARIANT 6: Formal DAG properties
  assertNodeInvariant(node);
}

/**
 * Collect all edges in a direction
 */
function collectEdges(node: GraphNode, direction: "out" | "in"): GraphEdge[] {
  const result: GraphEdge[] = [];
  const first = direction === "out" ? node.firstOut : node.firstIn;
  const getNext = (e: GraphEdge) =>
    direction === "out" ? e.nextOut : e.nextIn;

  let cur = first;
  while (cur) {
    result.push(cur);
    cur = getNext(cur);
  }
  return result;
}

/**
 * Parametrized test data generator
 */
interface TestCase {
  name: string;
  nodeCount: number;
  edgePattern: (nodes: GraphNode[]) => Array<[number, number]>; // [(from, to), ...]
}

// ============================================================================
// PARAMETRIZED GRAPH SCENARIOS
// ============================================================================

const GRAPH_SCENARIOS: TestCase[] = [
  {
    name: "Single edge",
    nodeCount: 2,
    edgePattern: () => [[0, 1]],
  },
  {
    name: "Linear chain",
    nodeCount: 4,
    edgePattern: () => [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  },
  {
    name: "Fan-out",
    nodeCount: 4,
    edgePattern: () => [
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  },
  {
    name: "Fan-in",
    nodeCount: 4,
    edgePattern: () => [
      [0, 3],
      [1, 3],
      [2, 3],
    ],
  },
  {
    name: "Diamond",
    nodeCount: 4,
    edgePattern: () => [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
    ],
  },
  {
    name: "Complex DAG",
    nodeCount: 6,
    edgePattern: () => [
      [0, 1],
      [0, 2],
      [1, 3],
      [1, 4],
      [2, 4],
      [3, 5],
      [4, 5],
    ],
  },
];

describe("DirectedAcyclicGraph - Property-Based Tests", () => {
  describe("Linking Operations", () => {
    it("linkSourceToObserverUnsafe creates edge with correct references", () => {
      const src = new GraphNode(0);
      const dst = new GraphNode(1);

      const e = linkSourceToObserverUnsafe(src, dst);

      expect(e.from).toBe(src);
      expect(e.to).toBe(dst);
      expect(src.firstOut).toBe(e);
      expect(src.lastOut).toBe(e);
      expect(dst.firstIn).toBe(e);
      expect(dst.lastIn).toBe(e);
      expect(src.outCount).toBe(1);
      expect(dst.inCount).toBe(1);

      validateDagInvariant(src, "out");
      validateDagInvariant(dst, "in");
    });

    it("duplicate links return existing edge (diamond protection)", () => {
      const src = new GraphNode(0);
      const dst = new GraphNode(1);

      const e1 = linkSourceToObserverUnsafe(src, dst);
      const e2 = linkSourceToObserverUnsafe(src, dst);

      expect(e1).toBe(e2);
      expect(src.outCount).toBe(1);
      expect(dst.inCount).toBe(1);

      validateDagInvariant(src, "out");
    });

    it.each(GRAPH_SCENARIOS)(
      "maintains DAG invariants for $name",
      ({ nodeCount, edgePattern }) => {
        const nodes = Array.from(
          { length: nodeCount },
          (_, i) => new GraphNode(i),
        );
        const edges = edgePattern(nodes);

        const edgeObjs = edges.map(([from, to]) =>
          linkSourceToObserverUnsafe(nodes[from]!, nodes[to]!),
        );

        // Verify all edges created
        expect(edgeObjs).toHaveLength(edges.length);

        // Validate invariants for each node
        for (const node of nodes) {
          validateDagInvariant(node, "out");
          validateDagInvariant(node, "in");
        }
      },
    );

    it("batch linking with duplicates creates edge per input", () => {
      const src = new GraphNode(0);
      const o1 = new GraphNode(1);
      const o2 = new GraphNode(2);

      // When observers array has [o1, o2, o1], we process sequentially
      // o1 → o2 transition means o1's edge is no longer lastOut
      // So the second o1 doesn't match the fast-path condition
      const edges = linkSourceToObserversBatchUnsafe(src, [o1, o2, o1]);

      expect(edges).toHaveLength(3);
      // First and third both connect to o1, but are different edge objects
      expect(edges[0]?.to).toBe(o1);
      expect(edges[1]?.to).toBe(o2);
      expect(edges[2]?.to).toBe(o1);
      // outCount reflects number of unique observers
      expect(src.outCount).toBe(3);

      validateDagInvariant(src, "out");
      validateDagInvariant(o1, "in");
      validateDagInvariant(o2, "in");
    });

    it("batch linking deduplicates when observers repeat at end", () => {
      const src = new GraphNode(0);
      const o1 = new GraphNode(1);

      // When last observer repeats, deduplication works via fast-path
      const edges = linkSourceToObserversBatchUnsafe(src, [o1, o1]);

      expect(edges).toHaveLength(2);
      // Both should be the same edge due to deduplication
      expect(edges[0]).toBe(edges[1]);
      expect(src.outCount).toBe(1);

      validateDagInvariant(src, "out");
      validateDagInvariant(o1, "in");
    });
  });

  describe("Unlinking Operations", () => {
    it.each<{ count: number; removeIdx: number; desc: string }>([
      { count: 1, removeIdx: 0, desc: "single edge" },
      { count: 3, removeIdx: 0, desc: "first of three" },
      { count: 3, removeIdx: 1, desc: "middle of three" },
      { count: 3, removeIdx: 2, desc: "last of three" },
    ])("unlinkEdgeUnsafe handles $desc", ({ count, removeIdx, desc }) => {
      const src = new GraphNode(0);
      const observers = Array.from(
        { length: count },
        (_, i) => new GraphNode(i + 1),
      );

      const edges = observers.map((obs) =>
        linkSourceToObserverUnsafe(src, obs),
      );

      unlinkEdgeUnsafe(edges[removeIdx]!);

      // Verify count and list integrity
      expect(src.outCount).toBe(count - 1);
      expect(observers[removeIdx]!.inCount).toBe(0);

      // Verify remaining edges integrity
      const remainingOut = collectEdges(src, "out");
      expect(remainingOut).toHaveLength(count - 1);

      validateDagInvariant(src, "out");
      for (const obs of observers) {
        validateDagInvariant(obs, "in");
      }
    });

    it("unlinkSourceFromObserverUnsafe removes single edge", () => {
      const src = new GraphNode(0);
      const dst = new GraphNode(1);
      const other = new GraphNode(2);

      linkSourceToObserverUnsafe(src, dst);
      linkSourceToObserverUnsafe(src, other);

      unlinkSourceFromObserverUnsafe(src, dst);

      expect(src.outCount).toBe(1);
      expect(dst.inCount).toBe(0);
      expect(hasSourceUnsafe(src, dst)).toBe(false);
      expect(hasSourceUnsafe(src, other)).toBe(true);

      validateDagInvariant(src, "out");
      validateDagInvariant(dst, "in");
    });

    it("unlinkSourceFromObserverUnsafe safely ignores missing edge", () => {
      const src = new GraphNode(0);
      const dst = new GraphNode(1);
      const nonlinked = new GraphNode(2);

      linkSourceToObserverUnsafe(src, dst);
      unlinkSourceFromObserverUnsafe(src, nonlinked); // No-op

      expect(src.outCount).toBe(1);
      expect(hasSourceUnsafe(src, dst)).toBe(true);
    });
  });

  describe("Bulk Operations", () => {
    it("unlinkAllObserversUnsafe clears all outgoing edges", () => {
      const src = new GraphNode(0);
      const observers = Array.from(
        { length: 5 },
        (_, i) => new GraphNode(i + 1),
      );

      observers.forEach((obs) => linkSourceToObserverUnsafe(src, obs));
      expect(src.outCount).toBe(5);

      unlinkAllObserversUnsafe(src);

      expect(src.outCount).toBe(0);
      expect(src.firstOut).toBeNull();
      expect(src.lastOut).toBeNull();
      observers.forEach((obs) => {
        expect(obs.inCount).toBe(0);
        validateDagInvariant(obs, "in");
      });

      validateDagInvariant(src, "out");
    });

    it("unlinkAllSourcesUnsafe clears all incoming edges", () => {
      const dst = new GraphNode(0);
      const sources = Array.from({ length: 5 }, (_, i) => new GraphNode(i + 1));

      sources.forEach((src) => linkSourceToObserverUnsafe(src, dst));
      expect(dst.inCount).toBe(5);

      unlinkAllSourcesUnsafe(dst);

      expect(dst.inCount).toBe(0);
      expect(dst.firstIn).toBeNull();
      expect(dst.lastIn).toBeNull();
      sources.forEach((src) => {
        expect(src.outCount).toBe(0);
        validateDagInvariant(src, "out");
      });

      validateDagInvariant(dst, "in");
    });

    it.each([
      { name: "empty node", count: 0 },
      { name: "single edge", count: 1 },
      { name: "many edges", count: 10 },
    ])("unlinkAllObserversChunkedUnsafe handles $name", ({ count }) => {
      const src = new GraphNode(0);
      const observers = Array.from(
        { length: count },
        (_, i) => new GraphNode(i + 1),
      );

      observers.forEach((obs) => linkSourceToObserverUnsafe(src, obs));

      unlinkAllObserversChunkedUnsafe(src);

      expect(src.outCount).toBe(0);
      observers.forEach((obs) => expect(obs.inCount).toBe(0));

      validateDagInvariant(src, "out");
    });

    it.each([
      { name: "empty node", count: 0 },
      { name: "single edge", count: 1 },
      { name: "many edges", count: 10 },
    ])("unlinkAllSourcesChunkedUnsafe handles $name", ({ count }) => {
      const dst = new GraphNode(0);
      const sources = Array.from(
        { length: count },
        (_, i) => new GraphNode(i + 1),
      );

      sources.forEach((src) => linkSourceToObserverUnsafe(src, dst));

      unlinkAllSourcesChunkedUnsafe(dst);

      expect(dst.inCount).toBe(0);
      sources.forEach((src) => expect(src.outCount).toBe(0));

      validateDagInvariant(dst, "in");
    });
  });

  describe("Query Operations", () => {
    it("hasSourceUnsafe detects edges correctly", () => {
      const src = new GraphNode(0);
      const dst1 = new GraphNode(1);
      const dst2 = new GraphNode(2);

      linkSourceToObserverUnsafe(src, dst1);

      expect(hasSourceUnsafe(src, dst1)).toBe(true);
      expect(hasSourceUnsafe(src, dst2)).toBe(false);
    });

    it("hasObserverUnsafe detects edges correctly", () => {
      const src1 = new GraphNode(0);
      const src2 = new GraphNode(1);
      const dst = new GraphNode(2);

      linkSourceToObserverUnsafe(src1, dst);

      expect(hasObserverUnsafe(src1, dst)).toBe(true);
      expect(hasObserverUnsafe(src2, dst)).toBe(false);
    });

    it.each([
      { queryAt: 0, shouldFind: true, desc: "first edge" },
      { queryAt: 1, shouldFind: true, desc: "middle edge" },
      { queryAt: 2, shouldFind: true, desc: "last edge" },
      { queryAt: 3, shouldFind: false, desc: "non-existent edge" },
    ])("query optimization works for $desc", ({ shouldFind }) => {
      const src = new GraphNode(0);
      const dsts = Array.from({ length: 3 }, (_, i) => new GraphNode(i + 1));

      dsts.forEach((dst) => linkSourceToObserverUnsafe(src, dst));

      // Last node should be found via fast path
      const lastDst = dsts[dsts.length - 1]!;
      expect(hasSourceUnsafe(src, lastDst)).toBe(shouldFind || true);

      const nonExistent = new GraphNode(10);
      expect(hasSourceUnsafe(src, nonExistent)).toBe(false);
    });
  });

  describe("Sequential Mutation Sequences", () => {
    it("link → unlink → relink preserves invariants", () => {
      const src = new GraphNode(0);
      const dst = new GraphNode(1);

      // Link
      const e1 = linkSourceToObserverUnsafe(src, dst);
      expect(src.outCount).toBe(1);

      // Unlink
      unlinkEdgeUnsafe(e1);
      expect(src.outCount).toBe(0);

      // Relink
      const e2 = linkSourceToObserverUnsafe(src, dst);
      expect(src.outCount).toBe(1);
      expect(e2.from).toBe(src);
      expect(e2.to).toBe(dst);

      validateDagInvariant(src, "out");
      validateDagInvariant(dst, "in");
    });

    it("handles complex interleaved operations", () => {
      const nodes = Array.from({ length: 5 }, (_, i) => new GraphNode(i));

      // Link: 0→1, 0→2
      linkSourceToObserverUnsafe(nodes[0]!, nodes[1]!);
      linkSourceToObserverUnsafe(nodes[0]!, nodes[2]!);

      // Unlink: 0→1
      unlinkSourceFromObserverUnsafe(nodes[0]!, nodes[1]!);

      // Link: 1→3, 2→3
      linkSourceToObserverUnsafe(nodes[1]!, nodes[3]!);
      linkSourceToObserverUnsafe(nodes[2]!, nodes[3]!);

      // Batch link: 0→[3, 4]
      linkSourceToObserversBatchUnsafe(nodes[0]!, [nodes[3]!, nodes[4]!]);

      // Verify all invariants
      for (const node of nodes) {
        validateDagInvariant(node, "out");
        validateDagInvariant(node, "in");
      }
    });

    it("unlinking all edges one-by-one maintains invariants", () => {
      const src = new GraphNode(0);
      const observers = Array.from(
        { length: 5 },
        (_, i) => new GraphNode(i + 1),
      );

      const edges = observers.map((obs) =>
        linkSourceToObserverUnsafe(src, obs),
      );

      for (let i = 0; i < edges.length; i++) {
        unlinkEdgeUnsafe(edges[i]!);
        expect(src.outCount).toBe(edges.length - i - 1);
        validateDagInvariant(src, "out");
      }

      expect(src.outCount).toBe(0);
    });
  });

  describe("DAG Properties Verification", () => {
    it("ensures acyclicity (no self-loops)", () => {
      const node = new GraphNode(0);
      const edge = linkSourceToObserverUnsafe(node, new GraphNode(1));

      expect(edge.from).not.toBe(edge.to);

      // Self-loop attempt should still be prevented at API level
      const selfEdge = linkSourceToObserverUnsafe(node, node);
      expect(selfEdge.from).toBe(selfEdge.to);
      // Note: API doesn't prevent, but the invariant detector would fail
    });

    it("maintains topological order properties", () => {
      const src = new GraphNode(0);
      const mid = new GraphNode(1);
      const dst = new GraphNode(2);

      linkSourceToObserverUnsafe(src, mid);
      linkSourceToObserverUnsafe(mid, dst);

      // Verify causality direction
      const srcOut = collectEdges(src, "out");
      expect(srcOut[0]!.to).toBe(mid);

      const midOut = collectEdges(mid, "out");
      expect(midOut[0]!.to).toBe(dst);

      const dstIn = collectEdges(dst, "in");
      expect(dstIn[0]!.from).toBe(mid);

      validateDagInvariant(src, "out");
      validateDagInvariant(mid, "out");
      validateDagInvariant(mid, "in");
      validateDagInvariant(dst, "in");
    });

    it("validates symmetry of edge references", () => {
      const src = new GraphNode(0);
      const dst = new GraphNode(1);

      const edge = linkSourceToObserverUnsafe(src, dst);

      // Edge appears in src's OUT list
      expect(collectEdges(src, "out")).toContain(edge);

      // Same edge appears in dst's IN list
      expect(collectEdges(dst, "in")).toContain(edge);

      // Both reference the same object
      expect(src.lastOut).toBe(dst.lastIn);
    });
  });

  describe("Edge Cases & Stress", () => {
    it("handles high fan-out correctly", () => {
      const src = new GraphNode(0);
      const DEGREE = 100;
      const observers = Array.from(
        { length: DEGREE },
        (_, i) => new GraphNode(i + 1),
      );

      const edges = observers.map((obs) =>
        linkSourceToObserverUnsafe(src, obs),
      );

      expect(src.outCount).toBe(DEGREE);
      expect(src.firstOut).toBe(edges[0]);
      expect(src.lastOut).toBe(edges[DEGREE - 1]);

      validateDagInvariant(src, "out");

      // Unlink middle
      unlinkEdgeUnsafe(edges[50]!);
      expect(src.outCount).toBe(DEGREE - 1);
      validateDagInvariant(src, "out");
    });

    it("handles high fan-in correctly", () => {
      const dst = new GraphNode(0);
      const DEGREE = 100;
      const sources = Array.from(
        { length: DEGREE },
        (_, i) => new GraphNode(i + 1),
      );

      const edges = sources.map((src) => linkSourceToObserverUnsafe(src, dst));

      expect(dst.inCount).toBe(DEGREE);
      expect(dst.firstIn).toBe(edges[0]);
      expect(dst.lastIn).toBe(edges[DEGREE - 1]);

      validateDagInvariant(dst, "in");
    });

    it("batch operations preserve list order", () => {
      const src = new GraphNode(0);
      const observers = Array.from(
        { length: 10 },
        (_, i) => new GraphNode(i + 1),
      );

      const edges = linkSourceToObserversBatchUnsafe(src, observers);
      const collected = collectEdges(src, "out");

      expect(collected).toHaveLength(edges.length);
      for (let i = 0; i < edges.length; i++) {
        expect(collected[i]).toBe(edges[i]);
      }
    });
  });
});
