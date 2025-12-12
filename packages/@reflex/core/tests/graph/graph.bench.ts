import { describe, bench } from "vitest";

import {
  linkSourceToObserverUnsafe,
  unlinkSourceFromObserverUnsafe,
  unlinkAllObserversUnsafe,
} from "../../src/graph/process/graph.methods";

import { GraphNode } from "../../src/graph/process/graph.node";
import { GraphService } from "../../src/graph/graph.contract";

const r = new GraphService();

/** Create node */
function makeNode(): GraphNode {
  return new GraphNode(0);
}

/** Collect OUT edges of a node (edges: node → observer) */
function collectOutEdges(node: GraphNode) {
  const arr = [];
  let e = node.firstOut;
  while (e) {
    arr.push(e);
    e = e.nextOut;
  }
  return arr;
}

/** Collect IN edges of a node (edges: source → node) */
function collectInEdges(node: GraphNode) {
  const arr = [];
  let e = node.firstIn;
  while (e) {
    arr.push(e);
    e = e.nextIn;
  }
  return arr;
}

describe("DAG O(1) intrusive graph benchmarks (edge-based)", () => {
  // ──────────────────────────────────────────────────────────────
  // 1. Basic 1k link/unlink cycles for both APIs
  // ──────────────────────────────────────────────────────────────

  bench("GraphService.addObserver/removeObserver (1k ops)", () => {
    const A = makeNode();
    const B = makeNode();

    for (let i = 0; i < 1000; i++) {
      r.addObserver(A, B);
      r.removeObserver(A, B);
    }
  });

  bench("Unsafe link/unlink (1k ops)", () => {
    const A = makeNode();
    const B = makeNode();

    for (let i = 0; i < 1000; i++) {
      linkSourceToObserverUnsafe(A, B);
      unlinkSourceFromObserverUnsafe(A, B);
    }
  });

  // ──────────────────────────────────────────────────────────────
  // 2. Mixed random link/unlink operations
  // ──────────────────────────────────────────────────────────────

  bench("1000 mixed link/unlink operations (random-ish)", () => {
    const nodes = Array.from({ length: 50 }, makeNode);

    for (let i = 0; i < 1000; i++) {
      const a = nodes[(i * 5) % nodes.length]!;
      const b = nodes[(i * 17) % nodes.length]!;

      if (a !== b) {
        r.addObserver(a, b);
        if (i % 2 === 0) r.removeObserver(a, b);
      }
    }
  });

  // ──────────────────────────────────────────────────────────────
  // 3. Star linking
  // ──────────────────────────────────────────────────────────────

  bench("massive star graph: 1 source → 1k observers", () => {
    const source = makeNode();
    const observers = Array.from({ length: 1000 }, makeNode);

    for (const obs of observers) r.addObserver(source, obs);
  });

  // ──────────────────────────────────────────────────────────────
  // 4. Star unlink (bulk)
  // ──────────────────────────────────────────────────────────────

  bench("massive star unlink: unlink all observers from 1 source (1k)", () => {
    const source = makeNode();
    const observers = Array.from({ length: 1000 }, makeNode);

    for (const obs of observers) r.addObserver(source, obs);
    unlinkAllObserversUnsafe(source);
  });

  // ──────────────────────────────────────────────────────────────
  // 5. Star unlink piecewise (corrected)
  // ──────────────────────────────────────────────────────────────

  bench("star unlink piecemeal: remove each observer individually", () => {
    const source = makeNode();
    const observers = Array.from({ length: 1000 }, makeNode);

    for (const obs of observers) r.addObserver(source, obs);

    // Correct: removeObserver, not addObserver
    for (const obs of observers) r.removeObserver(source, obs);
  });

  // ──────────────────────────────────────────────────────────────
  // 7. Random DAG simulation (10k edges)
  // ──────────────────────────────────────────────────────────────

  bench("DAG simulation: 100 nodes, 10k random edges", () => {
    const nodes = Array.from({ length: 100 }, makeNode);

    for (let i = 0; i < 10000; i++) {
      const a = nodes[Math.floor(Math.random() * 100)]!;
      const b = nodes[Math.floor(Math.random() * 100)]!;
      if (a !== b) linkSourceToObserverUnsafe(a, b);
    }
  });

  // ──────────────────────────────────────────────────────────────
  // 8. Degree counting sanity test
  // ──────────────────────────────────────────────────────────────

  bench("counting observer/source degree: 1k nodes, sparse connections", () => {
    const nodes = Array.from({ length: 1000 }, makeNode);

    // Sparse layering: DAG i → (i+1..i+4)
    for (let i = 0; i < 1000; i++) {
      const src = nodes[i]!;
      for (let j = i + 1; j < Math.min(i + 5, nodes.length); j++) {
        r.addObserver(src, nodes[j]!);
      }
    }

    let sumOut = 0;
    let sumIn = 0;

    for (const n of nodes) {
      sumOut += n.outCount;
      sumIn += n.inCount;
    }

    if (sumOut !== sumIn) {
      throw new Error(
        `Degree mismatch: OUT=${sumOut}, IN=${sumIn} — graph invariant broken`,
      );
    }
  });

});
