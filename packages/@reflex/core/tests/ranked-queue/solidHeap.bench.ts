import { bench, describe } from "vitest";
import {
  insertIntoHeap,
  deleteFromHeap,
  adjustHeight,
  runHeap,
} from "./compare/solidHeap";

const N = 2048;
// --------------------------------------------------
// Minimal test node
// --------------------------------------------------

function createNode(): any {
  return {
    _height: 0,
    _prevHeap: null,
    _nextHeap: undefined,
    _deps: null,
    _subs: null,
  };
}

function createHeap(): any {
  return {
    _heap: [],
    _min: 0,
    _max: 0,
  };
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function createLinearGraph(n: number) {
  const nodes = Array.from({ length: n }, createNode);

  for (let i = 1; i < n; i++) {
    nodes[i]._deps = {
      _dep: nodes[i - 1],
      _nextDep: null,
    };
  }

  return nodes;
}

// ==================================================
// BENCHES
// ==================================================

describe("SimpleHeap Benchmarks", () => {
  bench("insertIntoHeap 2k", () => {
    const heap = createHeap();
    const nodes = Array.from({ length: N }, createNode);

    for (let i = 0; i < N; i++) {
      nodes[i]._height = (Math.random() * 32) | 0;
      insertIntoHeap(nodes[i], heap);
    }
  });

  bench("deleteFromHeap 2k", () => {
    const heap = createHeap();
    const nodes = Array.from({ length: N }, createNode);

    for (let i = 0; i < N; i++) {
      nodes[i]._height = 0;
      insertIntoHeap(nodes[i], heap);
    }

    for (let i = 0; i < N; i++) {
      deleteFromHeap(nodes[i], heap);
    }
  });

  bench("adjustHeight linear chain 2k", () => {
    const heap = createHeap();
    const nodes = createLinearGraph(N);

    for (let i = 0; i < N; i++) {
      insertIntoHeap(nodes[i], heap);
    }

    for (let i = 0; i < N; i++) {
      adjustHeight(nodes[i], heap);
    }
  });

  bench("runHeap linear chain 2k", () => {
    const heap = createHeap();
    const nodes = createLinearGraph(N);

    for (let i = 0; i < N; i++) {
      insertIntoHeap(nodes[i], heap);
    }

    runHeap(heap, () => {});
  });

  bench("mixed insert + adjust + delete", () => {
    const heap = createHeap();
    const nodes = Array.from({ length: N }, createNode);

    for (let i = 0; i < N; i++) {
      const node = nodes[i];
      node._height = (Math.random() * 16) | 0;
      insertIntoHeap(node, heap);

      if (i % 3 === 0) {
        adjustHeight(node, heap);
      }

      if (i % 5 === 0) {
        deleteFromHeap(node, heap);
      }
    }
  });
});
