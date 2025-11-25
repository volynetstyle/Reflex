import { describe, bench } from "vitest";
import {
  linkSourceToObserverUnsafe,
  unlinkSourceFromObserverUnsafe,
  unlinkAllObserversUnsafe,
} from "../../src/core/graph/utils/graph.intrusive";
import { linkEdge, unlinkEdge } from "../../src/core/graph/utils/graph.linker";
import { IReactiveNode, GraphNode } from "../../src/core/graph/graph.node";

function makeNode(): IReactiveNode {
  return new GraphNode();
}

describe("DAG O(1) intrusive graph benchmarks", () => {
  bench("linkEdge + unlinkEdge (1k ops)", () => {
    const A = makeNode();
    const B = makeNode();

    for (let i = 0; i < 1000; i++) {
      linkEdge(A, B);
      unlinkEdge(A, B);
    }
  });

  bench(
    "linkSourceToObserverUnsafe + unlinkSourceFromObserverUnsafe (1k ops)",
    () => {
      const A = makeNode();
      const B = makeNode();

      for (let i = 0; i < 1000; i++) {
        linkSourceToObserverUnsafe(B, A);
        unlinkSourceFromObserverUnsafe(B, A);
      }
    },
  );

  bench("1000 mixed link/unlink operations", () => {
    const nodes = Array.from({ length: 50 }, makeNode);

    for (let i = 0; i < 1000; i++) {
      const A = nodes[(i * 7) % nodes.length];
      const B = nodes[(i * 13) % nodes.length];

      if (A && B && A !== B) {
        linkEdge(A, B);

        if (i % 2 === 0) {
          unlinkEdge(A, B);
        }
      }
    }
  });

  bench("massive star graph: link 1 source to 1k observers", () => {
    const center = makeNode();
    const leaves = Array.from({ length: 1000 }, makeNode);

    for (const leaf of leaves) {
      linkEdge(leaf, center);
    }
  });

  bench("massive star unlink: unlink all 1k observers from 1 source", () => {
    const center = makeNode();
    const leaves = Array.from({ length: 1000 }, makeNode);

    for (const leaf of leaves) {
      linkEdge(leaf, center);
    }

    unlinkAllObserversUnsafe(center);
  });

  bench(
    "star unlink piecemeal: individual unlinkEdge for each observer",
    () => {
      const center = makeNode();
      const leaves = Array.from({ length: 1000 }, makeNode);

      for (const leaf of leaves) {
        linkEdge(leaf, center);
      }

      for (const leaf of leaves) {
        unlinkEdge(leaf, center);
      }
    },
  );

  bench("compare: naive array push/pop (1k ops)", () => {
    const arr: number[] = [];
    for (let i = 0; i < 1000; i++) {
      arr.push(i);
      arr.pop();
    }
  });

  bench("DAG simulation: 100 nodes, 10k random edges", () => {
    const nodes = Array.from({ length: 100 }, makeNode);

    for (let i = 0; i < 10000; i++) {
      const sourceIdx = Math.floor(Math.random() * nodes.length);
      const observerIdx = Math.floor(Math.random() * nodes.length);

      if (sourceIdx !== observerIdx) {
        const source = nodes[sourceIdx];
        const observer = nodes[observerIdx];

        if (source && observer) {
          linkSourceToObserverUnsafe(source, observer);
        }
      }
    }
  });

  bench("counting observer/source degree: 1k nodes with varying degree", () => {
    const nodes = Array.from({ length: 1000 }, makeNode);

    for (let i = 0; i < 1000; i++) {
      const src = nodes[i];
      for (let j = i + 1; j < Math.min(i + 5, nodes.length); j++) {
        const obs = nodes[j];
        if (src && obs) {
          linkEdge(obs, src);
        }
      }
    }

    let totalSources = 0;
    let totalObservers = 0;
    for (const node of nodes) {
      totalSources += node._sourceCount;
      totalObservers += node._observerCount;
    }

    if (totalSources !== totalObservers) {
      throw new Error("Sanity check failed: source/observer count mismatch");
    }
  });
});
