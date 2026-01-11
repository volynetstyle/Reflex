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
  GraphNode,
  GraphEdge,
} from "../../src/graph";

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

  expect(edges.length).toBe(count);

  if (count === 0) {
    expect(first).toBeNull();
    expect(last).toBeNull();
  } else {
    expect(first).toBe(edges[0]);
    expect(last).toBe(edges[edges.length - 1]);
  }

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
      /**
       * Visual:
       * 
       *   source ──→ observer
       * 
       * Guarantees:
       * - source.outCount === 1
       * - observer.inCount === 1
       * - edge.from === source
       * - edge.to === observer
       * - Doubly-linked list integrity maintained
       */
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

      assertListIntegrity(source, "out");
      assertListIntegrity(observer, "in");
    });

    it("handles duplicate link (hot path) - returns existing edge", () => {
      /**
       * Visual:
       * 
       *   source ──→ observer  (link #1)
       *   source ──→ observer  (link #2, should reuse edge)
       * 
       * Result:
       *   source ──→ observer  (single edge)
       * 
       * Guarantees:
       * - Diamond graph protection (no duplicate edges)
       * - e1 === e2 (same object reference)
       * - Counts remain 1
       */
      const { source, observer } = createTestGraph();

      const e1 = linkSourceToObserverUnsafe(source, observer);
      const e2 = linkSourceToObserverUnsafe(source, observer);

      expect(e1).toBe(e2);
      expect(source.outCount).toBe(1);
      expect(observer.inCount).toBe(1);

      assertListIntegrity(source, "out");
      assertListIntegrity(observer, "in");
    });

    it("creates multiple sequential edges correctly", () => {
      /**
       * Visual:
       * 
       *          ┌──→ o1
       *   source ├──→ o2
       *          └──→ o3
       * 
       * OUT list order: e1 ↔ e2 ↔ e3
       * 
       * Guarantees:
       * - Topological order preserved
       * - firstOut/lastOut correct
       * - prev/next pointers form valid chain
       */
      const { source, o1, o2, o3 } = createTestGraph();

      const e1 = linkSourceToObserverUnsafe(source, o1);
      const e2 = linkSourceToObserverUnsafe(source, o2);
      const e3 = linkSourceToObserverUnsafe(source, o3);

      expect(source.firstOut).toBe(e1);
      expect(source.lastOut).toBe(e3);
      expect(source.outCount).toBe(3);

      // Forward chain
      expect(e1.nextOut).toBe(e2);
      expect(e2.nextOut).toBe(e3);
      expect(e3.nextOut).toBeNull();

      // Backward chain
      expect(e1.prevOut).toBeNull();
      expect(e2.prevOut).toBe(e1);
      expect(e3.prevOut).toBe(e2);

      assertListIntegrity(source, "out");
    });

    it("handles multiple sources for one observer", () => {
      /**
       * Visual:
       * 
       *   s1 ──┐
       *   s2 ──┼──→ observer
       *   s3 ──┘
       * 
       * IN list order: e1 ↔ e2 ↔ e3
       * 
       * Guarantees:
       * - Fan-in correctly maintained
       * - observer.inCount === 3
       */
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
      /**
       * Visual (sequence):
       * 
       * Step 1:  source ──→ o1
       *          lastOut = e1
       * 
       * Step 2:  source ──┬──→ o1
       *                   └──→ o2
       *          lastOut = e2
       * 
       * Guarantees:
       * - lastOut always points to newest edge
       * - prev/next chains valid
       */
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
      /**
       * Visual:
       * 
       * Before:  source ──→ observer
       * After:   source     observer  (disconnected)
       * 
       * Guarantees:
       * - Both nodes have count = 0
       * - firstOut/lastOut = null
       * - firstIn/lastIn = null
       * - Edge pointers cleared
       */
      const { source, observer } = createTestGraph();

      const edge = linkSourceToObserverUnsafe(source, observer);
      unlinkEdgeUnsafe(edge);

      expect(source.firstOut).toBeNull();
      expect(source.lastOut).toBeNull();
      expect(source.outCount).toBe(0);

      expect(observer.firstIn).toBeNull();
      expect(observer.lastIn).toBeNull();
      expect(observer.inCount).toBe(0);

      expect(edge.prevOut).toBeNull();
      expect(edge.nextOut).toBeNull();
      expect(edge.prevIn).toBeNull();
      expect(edge.nextIn).toBeNull();
    });

    it("unlinks first edge in chain", () => {
      /**
       * Visual:
       * 
       * Before:  source ──┬──→ o1
       *                   ├──→ o2
       *                   └──→ o3
       * 
       * Unlink e1:
       * 
       * After:   source ──┬──→ o2  (now first)
       *                   └──→ o3
       * 
       * Guarantees:
       * - firstOut updated to e2
       * - e2.prevOut === null
       * - Chain integrity maintained
       */
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
      /**
       * Visual:
       * 
       * Before:  source ──┬──→ o1
       *                   ├──→ o2  ← unlink this
       *                   └──→ o3
       * 
       * After:   source ──┬──→ o1
       *                   └──→ o3
       * 
       * Result chain: e1 ↔ e3
       * 
       * Guarantees:
       * - e1.nextOut === e3
       * - e3.prevOut === e1
       * - firstOut/lastOut unchanged
       */
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
      /**
       * Visual:
       * 
       * Before:  source ──┬──→ o1
       *                   ├──→ o2
       *                   └──→ o3  ← unlink this
       * 
       * After:   source ──┬──→ o1
       *                   └──→ o2  (now last)
       * 
       * Guarantees:
       * - lastOut updated to e2
       * - e2.nextOut === null
       */
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
      /**
       * Visual (sequence):
       * 
       * Start:    source ──┬──→ o1
       *                    ├──→ o2
       *                    └──→ o3
       * 
       * Unlink e1: source ──┬──→ o2
       *                     └──→ o3
       * 
       * Unlink e2: source ──→ o3
       * 
       * Unlink e3: source  (empty)
       * 
       * Guarantees:
       * - Integrity maintained at each step
       * - Final state: count = 0, pointers null
       */
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
      /**
       * Visual:
       * 
       * Before:  source ──→ observer
       * 
       * unlinkSourceFromObserverUnsafe(source, observer)
       * 
       * After:   source     observer  (disconnected)
       * 
       * Guarantees:
       * - Edge found and removed
       * - Both sides cleaned
       */
      const { source, observer } = createTestGraph();

      linkSourceToObserverUnsafe(source, observer);
      unlinkSourceFromObserverUnsafe(source, observer);

      expect(source.outCount).toBe(0);
      expect(observer.inCount).toBe(0);
      assertListIntegrity(source, "out");
      assertListIntegrity(observer, "in");
    });

    it("uses fast path (lastOut check)", () => {
      /**
       * Visual:
       * 
       *          ┌──→ o1
       *   source └──→ o2  ← lastOut (fast path)
       * 
       * Fast path checks lastOut first before traversing
       * 
       * Guarantees:
       * - O(1) removal when target is last
       * - Chain integrity maintained
       */
      const { source, o1, o2 } = createTestGraph();

      linkSourceToObserverUnsafe(source, o1);
      const e2 = linkSourceToObserverUnsafe(source, o2);

      expect(source.lastOut).toBe(e2);

      unlinkSourceFromObserverUnsafe(source, o2);

      expect(source.outCount).toBe(1);
      expect(source.lastOut?.to).toBe(o1);
    });

    it("handles middle edge removal", () => {
      /**
       * Visual:
       * 
       * Before:  s1 ──┐
       *          s2 ──┼──→ observer  ← unlink s2
       *          s3 ──┘
       * 
       * After:   s1 ──┐
       *          s3 ──┘──→ observer
       * 
       * IN chain: e1 ↔ e3
       * 
       * Guarantees:
       * - Middle removal handled correctly
       * - IN list integrity maintained
       */
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
      /**
       * Visual:
       * 
       *   source ──→ o1
       * 
       * Try: unlinkSourceFromObserverUnsafe(source, observer)
       * 
       * Result: No-op (edge doesn't exist)
       * 
       * Guarantees:
       * - Safe to call on non-existent edge
       * - No corruption of existing edges
       */
      const { source, observer, o1 } = createTestGraph();

      linkSourceToObserverUnsafe(source, o1);

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
      /**
       * Visual:
       * 
       * Before:      ┌──→ o1
       *       source ├──→ o2
       *              └──→ o3
       * 
       * unlinkAllObserversUnsafe(source)
       * 
       * After:  source  o1  o2  o3  (all disconnected)
       * 
       * Guarantees:
       * - All OUT edges removed
       * - All observer IN edges cleaned
       * - source.outCount === 0
       */
      const { source, o1, o2, o3 } = createTestGraph();

      linkSourceToObserverUnsafe(source, o1);
      linkSourceToObserverUnsafe(source, o2);
      linkSourceToObserverUnsafe(source, o3);

      unlinkAllObserversUnsafe(source);

      expect(source.outCount).toBe(0);
      expect(source.firstOut).toBeNull();
      expect(source.lastOut).toBeNull();

      expect(o1.inCount).toBe(0);
      expect(o2.inCount).toBe(0);
      expect(o3.inCount).toBe(0);

      assertListIntegrity(source, "out");
    });

    it("unlinkAllSourcesUnsafe clears all incoming edges", () => {
      /**
       * Visual:
       * 
       * Before:  s1 ──┐
       *          s2 ──┼──→ observer
       *          s3 ──┘
       * 
       * unlinkAllSourcesUnsafe(observer)
       * 
       * After:  s1  s2  s3  observer  (all disconnected)
       * 
       * Guarantees:
       * - All IN edges removed
       * - All source OUT edges cleaned
       * - observer.inCount === 0
       */
      const { observer, s1, s2, s3 } = createTestGraph();

      linkSourceToObserverUnsafe(s1, observer);
      linkSourceToObserverUnsafe(s2, observer);
      linkSourceToObserverUnsafe(s3, observer);

      unlinkAllSourcesUnsafe(observer);

      expect(observer.inCount).toBe(0);
      expect(observer.firstIn).toBeNull();
      expect(observer.lastIn).toBeNull();

      expect(s1.outCount).toBe(0);
      expect(s2.outCount).toBe(0);
      expect(s3.outCount).toBe(0);

      assertListIntegrity(observer, "in");
    });

    it("unlinkAllObserversChunkedUnsafe with empty node", () => {
      /**
       * Visual:
       * 
       *   source  (no edges)
       * 
       * unlinkAllObserversChunkedUnsafe(source)
       * 
       * Result: No-op
       * 
       * Guarantees:
       * - Safe on empty nodes
       */
      const { source } = createTestGraph();

      unlinkAllObserversChunkedUnsafe(source);

      expect(source.outCount).toBe(0);
    });

    it("unlinkAllObserversChunkedUnsafe with single edge", () => {
      /**
       * Visual:
       * 
       * Before:  source ──→ observer
       * 
       * unlinkAllObserversChunkedUnsafe(source)
       * 
       * After:   source     observer  (disconnected)
       * 
       * Guarantees:
       * - Works for single edge case
       * - Symmetric cleanup
       */
      const { source, observer } = createTestGraph();

      linkSourceToObserverUnsafe(source, observer);
      unlinkAllObserversChunkedUnsafe(source);

      expect(source.outCount).toBe(0);
      expect(observer.inCount).toBe(0);
    });

    it("unlinkAllObserversChunkedUnsafe with many edges", () => {
      /**
       * Visual:
       * 
       * Before:      ┌──→ o1
       *       source ├──→ o2
       *              └──→ o3
       * 
       * unlinkAllObserversChunkedUnsafe(source)
       * 
       * After:  source  o1  o2  o3  (all disconnected)
       * 
       * Guarantees:
       * - Bulk removal efficient
       * - All observers cleaned
       */
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
      /**
       * Visual:
       * 
       *   source + []
       * 
       * Result: No edges created
       * 
       * Guarantees:
       * - Safe with empty input
       */
      const { source } = createTestGraph();

      const edges = linkSourceToObserversBatchUnsafe(source, []);

      expect(edges).toEqual([]);
      expect(source.outCount).toBe(0);
    });

    it("linkSourceToObserversBatchUnsafe with single observer", () => {
      /**
       * Visual:
       * 
       *   source + [observer]
       * 
       * Result:  source ──→ observer
       * 
       * Guarantees:
       * - Batch with single item works
       */
      const { source, observer } = createTestGraph();

      const edges = linkSourceToObserversBatchUnsafe(source, [observer]);

      expect(edges.length).toBe(1);
      expect(edges[0]!.to).toBe(observer);
      expect(source.outCount).toBe(1);
    });

    it("linkSourceToObserversBatchUnsafe with multiple observers", () => {
      /**
       * Visual:
       * 
       *   source + [o1, o2, o3]
       * 
       * Result:      ┌──→ o1
       *       source ├──→ o2
       *              └──→ o3
       * 
       * Guarantees:
       * - Efficient batch creation
       * - Order preserved
       * - List integrity maintained
       */
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
      /**
       * Visual:
       * 
       *   source + [observer, observer]
       * 
       * Result:  source ──→ observer  (single edge)
       * 
       * Guarantees:
       * - Duplicate detection in batch
       * - Same edge returned twice in array
       * - No duplicate edges created
       */
      const { source, observer } = createTestGraph();

      const edges = linkSourceToObserversBatchUnsafe(source, [
        observer,
        observer,
      ]);

      expect(edges[0]).toBe(edges[1]);
      expect(source.outCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // QUERY OPERATIONS
  // --------------------------------------------------------------------------

  describe("Query Operations", () => {
    it("hasSourceUnsafe returns true for existing edge", () => {
      /**
       * Visual:
       * 
       *   source ──→ observer
       * 
       * Query: hasSourceUnsafe(source, observer)
       * 
       * Result: true
       * 
       * Guarantees:
       * - Edge detection works
       */
      const { source, observer } = createTestGraph();

      linkSourceToObserverUnsafe(source, observer);

      expect(hasSourceUnsafe(source, observer)).toBe(true);
    });

    it("hasSourceUnsafe returns false for non-existent edge", () => {
      /**
       * Visual:
       * 
       *   source ──→ o1
       * 
       * Query: hasSourceUnsafe(source, observer)
       * 
       * Result: false (different observer)
       * 
       * Guarantees:
       * - Correctly identifies missing edge
       */
      const { source, observer, o1 } = createTestGraph();

      linkSourceToObserverUnsafe(source, o1);

      expect(hasSourceUnsafe(source, observer)).toBe(false);
    });

    it("hasSourceUnsafe uses fast path (lastOut)", () => {
      /**
       * Visual:
       * 
       *          ┌──→ o1
       *   source └──→ o2  ← lastOut (fast path)
       * 
       * Query: hasSourceUnsafe(source, o2)
       * 
       * Optimization: Checks lastOut before traversing
       * 
       * Guarantees:
       * - O(1) check when target is last
       */
      const { source, o1, o2 } = createTestGraph();

      linkSourceToObserverUnsafe(source, o1);
      linkSourceToObserverUnsafe(source, o2);

      expect(hasSourceUnsafe(source, o2)).toBe(true);
    });

    it("hasObserverUnsafe traverses IN list", () => {
      /**
       * Visual:
       * 
       *   source ──→ observer
       * 
       * Query: hasObserverUnsafe(source, observer)
       * 
       * Result: true
       * 
       * Guarantees:
       * - IN list traversal works
       * - Symmetric to hasSourceUnsafe
       */
      const { source, observer } = createTestGraph();

      linkSourceToObserverUnsafe(source, observer);

      expect(hasObserverUnsafe(source, observer)).toBe(true);
    });
  });
});