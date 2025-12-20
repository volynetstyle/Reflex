import { describe, it, expect, beforeEach } from "vitest";
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
  replaceSourceUnsafe,
} from "../../src/graph/graph.methods";
import { GraphNode, GraphEdge } from "../../src/graph/graph.node";

// ============================================================================
// HELPERS
// ============================================================================

function collectOutEdges(node: GraphNode): GraphEdge[] {
  const result: GraphEdge[] = [];
  let cur = node.firstOut;
  while (cur) {
    result.push(cur);
    cur = cur.nextOut;
  }
  return result;
}

function collectInEdges(node: GraphNode): GraphEdge[] {
  const result: GraphEdge[] = [];
  let cur = node.firstIn;
  while (cur) {
    result.push(cur);
    cur = cur.nextIn;
  }
  return result;
}

function assertListIntegrity(node: GraphNode, direction: "out" | "in"): void {
  const edges =
    direction === "out" ? collectOutEdges(node) : collectInEdges(node);
  const count = direction === "out" ? node.outCount : node.inCount;
  const first = direction === "out" ? node.firstOut : node.firstIn;
  const last = direction === "out" ? node.lastOut : node.lastIn;

  // Check count matches actual edges
  expect(edges.length).toBe(count);

  // Check first/last pointers
  if (count === 0) {
    expect(first).toBeNull();
    expect(last).toBeNull();
  } else {
    expect(first).toBe(edges[0]);
    expect(last).toBe(edges[edges.length - 1]);
  }

  // Check doubly-linked list integrity
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]!;
    const prev = direction === "out" ? edge.prevOut : edge.prevIn;
    const next = direction === "out" ? edge.nextOut : edge.nextIn;

    if (i === 0) {
      expect(prev).toBeNull();
    } else {
      expect(prev).toBe(edges[i - 1]);
    }

    if (i === edges.length - 1) {
      expect(next).toBeNull();
    } else {
      expect(next).toBe(edges[i + 1]);
    }
  }
}

function createTestGraph() {
  return {
    source: new GraphNode(0),
    observer: new GraphNode(1),
    o1: new GraphNode(2),
    o2: new GraphNode(3),
    o3: new GraphNode(4),
    s1: new GraphNode(5),
    s2: new GraphNode(6),
    s3: new GraphNode(7),
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe("Graph Operations - Comprehensive Tests", () => {
  // --------------------------------------------------------------------------
  // BASIC LINKING
  // --------------------------------------------------------------------------

  describe("Basic Linking", () => {
    it("creates symmetric edge between source and observer", () => {
      const { source, observer } = createTestGraph();

      const e = linkSourceToObserverUnsafe(source, observer);

      // OUT adjacency
      expect(source.firstOut).toBe(e);
      expect(source.lastOut).toBe(e);
      expect(source.outCount).toBe(1);

      // IN adjacency
      expect(observer.firstIn).toBe(e);
      expect(observer.lastIn).toBe(e);
      expect(observer.inCount).toBe(1);

      // Edge symmetry
      expect(e.from).toBe(source);
      expect(e.to).toBe(observer);
      expect(e.prevOut).toBeNull();
      expect(e.nextOut).toBeNull();
      expect(e.prevIn).toBeNull();
      expect(e.nextIn).toBeNull();

      // List integrity
      assertListIntegrity(source, "out");
      assertListIntegrity(observer, "in");
    });

    it("handles duplicate link (hot path) - returns existing edge", () => {
      const { source, observer } = createTestGraph();

      const e1 = linkSourceToObserverUnsafe(source, observer);
      const e2 = linkSourceToObserverUnsafe(source, observer);

      // Should return same edge (HOT PATH optimization)
      expect(e1).toBe(e2);
      expect(source.outCount).toBe(1);
      expect(observer.inCount).toBe(1);

      assertListIntegrity(source, "out");
      assertListIntegrity(observer, "in");
    });

    it("creates multiple sequential edges correctly", () => {
      const { source, o1, o2, o3 } = createTestGraph();

      const e1 = linkSourceToObserverUnsafe(source, o1);
      const e2 = linkSourceToObserverUnsafe(source, o2);
      const e3 = linkSourceToObserverUnsafe(source, o3);

      // Check chain order
      expect(source.firstOut).toBe(e1);
      expect(source.lastOut).toBe(e3);
      expect(source.outCount).toBe(3);

      // Forward links
      expect(e1.nextOut).toBe(e2);
      expect(e2.nextOut).toBe(e3);
      expect(e3.nextOut).toBeNull();

      // Backward links
      expect(e1.prevOut).toBeNull();
      expect(e2.prevOut).toBe(e1);
      expect(e3.prevOut).toBe(e2);

      assertListIntegrity(source, "out");
    });

    it("handles multiple sources for one observer", () => {
      const { observer, s1, s2, s3 } = createTestGraph();

      const e1 = linkSourceToObserverUnsafe(s1, observer);
      const e2 = linkSourceToObserverUnsafe(s2, observer);
      const e3 = linkSourceToObserverUnsafe(s3, observer);

      expect(observer.inCount).toBe(3);
      expect(observer.firstIn).toBe(e1);
      expect(observer.lastIn).toBe(e3);

      assertListIntegrity(observer, "in");
    });

    it("correctly maintains tail pointers during append", () => {
      const { source, o1, o2 } = createTestGraph();

      const e1 = linkSourceToObserverUnsafe(source, o1);
      expect(source.lastOut).toBe(e1);

      const e2 = linkSourceToObserverUnsafe(source, o2);
      expect(source.lastOut).toBe(e2);
      expect(e1.nextOut).toBe(e2);
      expect(e2.prevOut).toBe(e1);
    });
  });

  // --------------------------------------------------------------------------
  // UNLINKING
  // --------------------------------------------------------------------------

  describe("Edge Unlinking", () => {
    it("unlinks single edge correctly", () => {
      const { source, observer } = createTestGraph();

      const edge = linkSourceToObserverUnsafe(source, observer);
      unlinkEdgeUnsafe(edge);

      // Source side
      expect(source.firstOut).toBeNull();
      expect(source.lastOut).toBeNull();
      expect(source.outCount).toBe(0);

      // Observer side
      expect(observer.firstIn).toBeNull();
      expect(observer.lastIn).toBeNull();
      expect(observer.inCount).toBe(0);

      // Edge cleanup
      expect(edge.prevOut).toBeNull();
      expect(edge.nextOut).toBeNull();
      expect(edge.prevIn).toBeNull();
      expect(edge.nextIn).toBeNull();
    });

    it("unlinks first edge in chain", () => {
      const { source, o1, o2, o3 } = createTestGraph();

      const e1 = linkSourceToObserverUnsafe(source, o1);
      const e2 = linkSourceToObserverUnsafe(source, o2);
      const e3 = linkSourceToObserverUnsafe(source, o3);

      unlinkEdgeUnsafe(e1);

      expect(source.firstOut).toBe(e2);
      expect(source.lastOut).toBe(e3);
      expect(source.outCount).toBe(2);
      expect(e2.prevOut).toBeNull();

      assertListIntegrity(source, "out");
    });

    it("unlinks middle edge in chain", () => {
      const { source, o1, o2, o3 } = createTestGraph();

      const e1 = linkSourceToObserverUnsafe(source, o1);
      const e2 = linkSourceToObserverUnsafe(source, o2);
      const e3 = linkSourceToObserverUnsafe(source, o3);

      unlinkEdgeUnsafe(e2);

      expect(source.outCount).toBe(2);
      expect(e1.nextOut).toBe(e3);
      expect(e3.prevOut).toBe(e1);
      expect(source.firstOut).toBe(e1);
      expect(source.lastOut).toBe(e3);

      assertListIntegrity(source, "out");
    });

    it("unlinks last edge in chain", () => {
      const { source, o1, o2, o3 } = createTestGraph();

      const e1 = linkSourceToObserverUnsafe(source, o1);
      const e2 = linkSourceToObserverUnsafe(source, o2);
      const e3 = linkSourceToObserverUnsafe(source, o3);

      unlinkEdgeUnsafe(e3);

      expect(source.lastOut).toBe(e2);
      expect(source.outCount).toBe(2);
      expect(e2.nextOut).toBeNull();

      assertListIntegrity(source, "out");
    });

    it("unlinks all edges one by one", () => {
      const { source, o1, o2, o3 } = createTestGraph();

      const e1 = linkSourceToObserverUnsafe(source, o1);
      const e2 = linkSourceToObserverUnsafe(source, o2);
      const e3 = linkSourceToObserverUnsafe(source, o3);

      unlinkEdgeUnsafe(e1);
      expect(source.outCount).toBe(2);
      assertListIntegrity(source, "out");

      unlinkEdgeUnsafe(e2);
      expect(source.outCount).toBe(1);
      assertListIntegrity(source, "out");

      unlinkEdgeUnsafe(e3);
      expect(source.outCount).toBe(0);
      expect(source.firstOut).toBeNull();
      expect(source.lastOut).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // UNLINK BY SOURCE/OBSERVER
  // --------------------------------------------------------------------------

  describe("unlinkSourceFromObserverUnsafe", () => {
    it("removes matching edge", () => {
      const { source, observer } = createTestGraph();

      linkSourceToObserverUnsafe(source, observer);
      unlinkSourceFromObserverUnsafe(source, observer);

      expect(source.outCount).toBe(0);
      expect(observer.inCount).toBe(0);
      assertListIntegrity(source, "out");
      assertListIntegrity(observer, "in");
    });

    it("uses fast path (lastOut check)", () => {
      const { source, o1, o2 } = createTestGraph();

      linkSourceToObserverUnsafe(source, o1);
      const e2 = linkSourceToObserverUnsafe(source, o2);

      // o2 is at lastOut (fast path)
      expect(source.lastOut).toBe(e2);

      unlinkSourceFromObserverUnsafe(source, o2);

      expect(source.outCount).toBe(1);
      expect(source.lastOut?.to).toBe(o1);
    });

    it("handles middle edge removal", () => {
      const { observer, s1, s2, s3 } = createTestGraph();

      linkSourceToObserverUnsafe(s1, observer);
      linkSourceToObserverUnsafe(s2, observer);
      linkSourceToObserverUnsafe(s3, observer);

      unlinkSourceFromObserverUnsafe(s2, observer);

      const chain = collectInEdges(observer);
      expect(chain.length).toBe(2);
      expect(chain[0]!.from).toBe(s1);
      expect(chain[1]!.from).toBe(s3);

      assertListIntegrity(observer, "in");
    });

    it("silently ignores non-existent edge", () => {
      const { source, observer, o1 } = createTestGraph();

      linkSourceToObserverUnsafe(source, o1);

      // Try to unlink non-existent edge
      unlinkSourceFromObserverUnsafe(source, observer);

      expect(source.outCount).toBe(1);
      assertListIntegrity(source, "out");
    });
  });

  // --------------------------------------------------------------------------
  // BULK OPERATIONS
  // --------------------------------------------------------------------------

  describe("Bulk Operations", () => {
    it("unlinkAllObserversUnsafe clears all edges", () => {
      const { source, o1, o2, o3 } = createTestGraph();

      linkSourceToObserverUnsafe(source, o1);
      linkSourceToObserverUnsafe(source, o2);
      linkSourceToObserverUnsafe(source, o3);

      unlinkAllObserversUnsafe(source);

      expect(source.outCount).toBe(0);
      expect(source.firstOut).toBeNull();
      expect(source.lastOut).toBeNull();

      // Check observers are also cleaned
      expect(o1.inCount).toBe(0);
      expect(o2.inCount).toBe(0);
      expect(o3.inCount).toBe(0);

      assertListIntegrity(source, "out");
    });

    it("unlinkAllSourcesUnsafe clears all incoming edges", () => {
      const { observer, s1, s2, s3 } = createTestGraph();

      linkSourceToObserverUnsafe(s1, observer);
      linkSourceToObserverUnsafe(s2, observer);
      linkSourceToObserverUnsafe(s3, observer);

      unlinkAllSourcesUnsafe(observer);

      expect(observer.inCount).toBe(0);
      expect(observer.firstIn).toBeNull();
      expect(observer.lastIn).toBeNull();

      // Check sources are also cleaned
      expect(s1.outCount).toBe(0);
      expect(s1.firstOut).toBeNull();
      expect(s2.outCount).toBe(0);
      expect(s2.firstOut).toBeNull();
      expect(s3.outCount).toBe(0);
      expect(s3.firstOut).toBeNull();

      assertListIntegrity(observer, "in");
    });

    it("unlinkAllObserversChunkedUnsafe with empty node", () => {
      const { source } = createTestGraph();

      unlinkAllObserversChunkedUnsafe(source);

      expect(source.outCount).toBe(0);
    });

    it("unlinkAllObserversChunkedUnsafe with single edge", () => {
      const { source, observer } = createTestGraph();

      linkSourceToObserverUnsafe(source, observer);
      unlinkAllObserversChunkedUnsafe(source);

      expect(source.outCount).toBe(0);
      expect(observer.inCount).toBe(0);
    });

    it("unlinkAllObserversChunkedUnsafe with many edges", () => {
      const { source, o1, o2, o3 } = createTestGraph();

      linkSourceToObserverUnsafe(source, o1);
      linkSourceToObserverUnsafe(source, o2);
      linkSourceToObserverUnsafe(source, o3);

      unlinkAllObserversChunkedUnsafe(source);

      expect(source.outCount).toBe(0);
      expect(o1.inCount).toBe(0);
      expect(o2.inCount).toBe(0);
      expect(o3.inCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // BATCH LINKING
  // --------------------------------------------------------------------------

  describe("Batch Linking", () => {
    it("linkSourceToObserversBatchUnsafe with empty array", () => {
      const { source } = createTestGraph();

      const edges = linkSourceToObserversBatchUnsafe(source, []);

      expect(edges).toEqual([]);
      expect(source.outCount).toBe(0);
    });

    it("linkSourceToObserversBatchUnsafe with single observer", () => {
      const { source, observer } = createTestGraph();

      const edges = linkSourceToObserversBatchUnsafe(source, [observer]);

      expect(edges.length).toBe(1);
      expect(edges[0]!.to).toBe(observer);
      expect(source.outCount).toBe(1);
    });

    it("linkSourceToObserversBatchUnsafe with multiple observers", () => {
      const { source, o1, o2, o3 } = createTestGraph();

      const edges = linkSourceToObserversBatchUnsafe(source, [o1, o2, o3]);

      expect(edges.length).toBe(3);
      expect(source.outCount).toBe(3);
      expect(edges[0]!.to).toBe(o1);
      expect(edges[1]!.to).toBe(o2);
      expect(edges[2]!.to).toBe(o3);

      assertListIntegrity(source, "out");
    });

    it("linkSourceToObserversBatchUnsafe handles duplicates", () => {
      const { source, observer } = createTestGraph();

      const edges = linkSourceToObserversBatchUnsafe(source, [
        observer,
        observer,
      ]);

      // Second link returns same edge (duplicate detection)
      expect(edges[0]).toBe(edges[1]);
      expect(source.outCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // QUERY OPERATIONS
  // --------------------------------------------------------------------------

  describe("Query Operations", () => {
    it("hasSourceUnsafe returns true for existing edge", () => {
      const { source, observer } = createTestGraph();

      linkSourceToObserverUnsafe(source, observer);

      expect(hasSourceUnsafe(source, observer)).toBe(true);
    });

    it("hasSourceUnsafe returns false for non-existent edge", () => {
      const { source, observer, o1 } = createTestGraph();

      linkSourceToObserverUnsafe(source, o1);

      expect(hasSourceUnsafe(source, observer)).toBe(false);
    });

    it("hasSourceUnsafe uses fast path (lastOut)", () => {
      const { source, o1, o2 } = createTestGraph();

      linkSourceToObserverUnsafe(source, o1);
      linkSourceToObserverUnsafe(source, o2);

      // o2 is at lastOut (fast path)
      expect(hasSourceUnsafe(source, o2)).toBe(true);
    });

    it("hasObserverUnsafe traverses IN list", () => {
      const { source, observer } = createTestGraph();

      linkSourceToObserverUnsafe(source, observer);

      expect(hasObserverUnsafe(source, observer)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // REPLACE OPERATIONS
  // --------------------------------------------------------------------------

  describe("Replace Operations", () => {
    it("replaceSourceUnsafe swaps source", () => {
      const { observer, s1, s2 } = createTestGraph();

      linkSourceToObserverUnsafe(s1, observer);

      replaceSourceUnsafe(s1, s2, observer);

      expect(s1.outCount).toBe(0);
      expect(s2.outCount).toBe(1);
      expect(observer.inCount).toBe(1);

      const edge = observer.firstIn;
      expect(edge?.from).toBe(s2);
      expect(edge?.to).toBe(observer);
    });

    it("replaceSourceUnsafe with multiple edges", () => {
      const { observer, o2, s1, s2 } = createTestGraph();

      linkSourceToObserverUnsafe(s1, observer);
      linkSourceToObserverUnsafe(s1, o2);

      replaceSourceUnsafe(s1, s2, observer);

      expect(s1.outCount).toBe(1); // Still has edge to o2
      expect(s2.outCount).toBe(1);

      const edges = collectInEdges(observer);
      expect(edges.length).toBe(1);
      expect(edges[0]!.from).toBe(s2);
    });
  });

  // --------------------------------------------------------------------------
  // EDGE CASES & STRESS TESTS
  // --------------------------------------------------------------------------

  describe("Edge Cases", () => {
    it("handles self-loop (node → itself)", () => {
      const { source } = createTestGraph();

      const edge = linkSourceToObserverUnsafe(source, source);

      expect(source.outCount).toBe(1);
      expect(source.inCount).toBe(1);
      expect(edge.from).toBe(source);
      expect(edge.to).toBe(source);

      assertListIntegrity(source, "out");
      assertListIntegrity(source, "in");
    });

    it("handles bidirectional edges", () => {
      const { source, observer } = createTestGraph();

      const e1 = linkSourceToObserverUnsafe(source, observer);
      const e2 = linkSourceToObserverUnsafe(observer, source);

      expect(source.outCount).toBe(1);
      expect(source.inCount).toBe(1);
      expect(observer.outCount).toBe(1);
      expect(observer.inCount).toBe(1);

      expect(e1).not.toBe(e2);
    });

    it("handles many-to-many relationships", () => {
      const { s1, s2, o1, o2 } = createTestGraph();

      linkSourceToObserverUnsafe(s1, o1);
      linkSourceToObserverUnsafe(s1, o2);
      linkSourceToObserverUnsafe(s2, o1);
      linkSourceToObserverUnsafe(s2, o2);

      expect(s1.outCount).toBe(2);
      expect(s2.outCount).toBe(2);
      expect(o1.inCount).toBe(2);
      expect(o2.inCount).toBe(2);

      assertListIntegrity(s1, "out");
      assertListIntegrity(s2, "out");
      assertListIntegrity(o1, "in");
      assertListIntegrity(o2, "in");
    });

    it("survives rapid link/unlink cycles", () => {
      const { source, observer } = createTestGraph();

      for (let i = 0; i < 100; i++) {
        const edge = linkSourceToObserverUnsafe(source, observer);
        expect(source.outCount).toBe(1);

        unlinkEdgeUnsafe(edge);
        expect(source.outCount).toBe(0);
      }

      assertListIntegrity(source, "out");
      assertListIntegrity(observer, "in");
    });

    it("handles large fan-out correctly", () => {
      const source = new GraphNode(0);
      const observers: GraphNode[] = [];

      for (let i = 0; i < 100; i++) {
        observers.push(new GraphNode(i + 1));
      }

      const edges = linkSourceToObserversBatchUnsafe(source, observers);

      expect(edges.length).toBe(100);
      expect(source.outCount).toBe(100);

      assertListIntegrity(source, "out");

      // Verify each observer
      observers.forEach((obs, i) => {
        expect(obs.inCount).toBe(1);
        expect(edges[i]!.to).toBe(obs);
      });
    });
  });

  // --------------------------------------------------------------------------
  // INITIALIZATION & WARMUP
  // --------------------------------------------------------------------------

  describe("Initialization", () => {
    it("GraphNode initialized with correct defaults", () => {
      const node = new GraphNode(42);

      expect(node.id).toBe(42);
      expect(node.inCount).toBe(0);
      expect(node.outCount).toBe(0);
      expect(node.firstIn).toBeNull();
      expect(node.lastIn).toBeNull();
      expect(node.firstOut).toBeNull();
      expect(node.lastOut).toBeNull();
      expect(node.point).toEqual({ t: 0, v: 0, g: 0, s: 0 });
    });

    it("GraphEdge initialized with correct defaults", () => {
      const { source, observer } = createTestGraph();

      const edge = new GraphEdge(source, observer);

      expect(edge.from).toBe(source);
      expect(edge.to).toBe(observer);
      expect(edge.prevOut).toBeNull();
      expect(edge.nextOut).toBeNull();
      expect(edge.prevIn).toBeNull();
      expect(edge.nextIn).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // INVARIANT CHECKS
  // --------------------------------------------------------------------------

  describe("Invariant Checks", () => {
    it("maintains count invariants after complex operations", () => {
      const { source, o1, o2, o3 } = createTestGraph();

      // Build
      linkSourceToObserverUnsafe(source, o1);
      linkSourceToObserverUnsafe(source, o2);
      linkSourceToObserverUnsafe(source, o3);

      expect(source.outCount).toBe(collectOutEdges(source).length);

      // Modify
      unlinkSourceFromObserverUnsafe(source, o2);

      expect(source.outCount).toBe(collectOutEdges(source).length);

      // Rebuild
      linkSourceToObserverUnsafe(source, o2);

      expect(source.outCount).toBe(collectOutEdges(source).length);
    });

    it("maintains symmetry between OUT and IN lists", () => {
      const { source, observer } = createTestGraph();

      const edge = linkSourceToObserverUnsafe(source, observer);

      // Edge appears in both lists
      const outEdges = collectOutEdges(source);
      const inEdges = collectInEdges(observer);

      expect(outEdges).toContain(edge);
      expect(inEdges).toContain(edge);

      unlinkEdgeUnsafe(edge);

      // Edge removed from both
      const outEdges2 = collectOutEdges(source);
      const inEdges2 = collectInEdges(observer);

      expect(outEdges2).not.toContain(edge);
      expect(inEdges2).not.toContain(edge);
    });
  });
});
