import { describe, bench } from "vitest";
import { IReactiveNode } from "../../src/core/graph/graph.types";
import { linkEdge, unlinkSourceLink, unlinkObserverLink } from "../../src/core/graph/utils/graph.linker";
import { LIST_HEAD } from "../../src/core/collections/intrusive-list";
 

function makeNode(): IReactiveNode {
  return {
    _valueRaw: null,    
    _sources: LIST_HEAD(),
    _observers: LIST_HEAD(),
    _observer: null,
    _counters: new Uint32Array(3),
    _async: new Uint32Array(2),
    _flags: 0,
    _kind: "computation",
  };
}

describe("DAG O(1) intrusive graph benchmarks", () => {
  bench("linkEdge → unlinkSourceLink (1k ops)", () => {
    const A = makeNode();
    const B = makeNode();

    for (let i = 0; i < 1000; i++) {
      const { _source } = linkEdge(A, B);
      unlinkSourceLink(_source);
    }
  });

  bench("linkEdge → unlinkObserverLink (1k ops)", () => {
    const A = makeNode();
    const B = makeNode();

    for (let i = 0; i < 1000; i++) {
      const { _observer } = linkEdge(A, B);
      unlinkObserverLink(_observer);
    }
  });

  bench("1000 mixed operations", () => {
    const nodes = Array.from({ length: 50 }, makeNode);

    for (let i = 0; i < 1000; i++) {
      const A = nodes[(i * 7) % nodes.length];
      const B = nodes[(i * 13) % nodes.length];

      if (A && B) {
        const { _source, _observer } = linkEdge(A, B);

        if (i % 2 === 0) {
          unlinkSourceLink(_source);
        } else {
          unlinkObserverLink(_observer);
        }
      }
    }
  });

  bench("massive star graph: link 1 → 1k", () => {
    const center = makeNode();
    const leaves = Array.from({ length: 1000 }, makeNode);

    for (const leaf of leaves) {
      linkEdge(leaf, center);
    }
  });

  bench("massive star unlink: unlink 1 → 1k via handles", () => {
    const center = makeNode();
    const leaves = Array.from({ length: 1000 }, makeNode);

    const links = leaves.map((leaf) => linkEdge(leaf, center)._source);

    for (const _source of links) {
      unlinkSourceLink(_source);
    }
  });

  bench("compare: naive array push/pop (1k ops)", () => {
    const arr: number[] = [];
    for (let i = 0; i < 1000; i++) {
      arr.push(i);
      arr.pop();
    }
  });
});
