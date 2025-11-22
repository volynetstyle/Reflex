import { describe, bench } from "vitest";
import { GraphNode } from "../../src/core/graph/graph.node";
import {
  linkEdge,
  unlinkEdge,
  unlinkAllObservers,
} from "../../src/core/graph/graph.operations";
import { linkPool } from "../../src/core/graph/graph.pool";

function makeNode(): GraphNode {
  return new GraphNode();
}

describe("DAG Intrusive Link + Pool Benchmarks", () => {
  bench("link + unlink (1k ops)", () => {
    const A = makeNode();
    const B = makeNode();

    for (let i = 0; i < 1000; i++) {
      const link = linkEdge(A, B);
      unlinkEdge(link);
    }
  });

  bench("1000 mixed link/unlink random pairs", () => {
    const nodes = Array.from({ length: 100 }, makeNode);
    const links = [];

    for (let i = 0; i < 1000; i++) {
      const A = nodes[(i * 7) % nodes.length]!;
      const B = nodes[(i * 13) % nodes.length]!;

      if (A !== B) {
        links.push(linkEdge(A, B));
      }

      if (i % 2 === 0 && links.length > 0) {
        unlinkEdge(links.pop()!);
      }
    }
  });

  bench("massive star: 1 source -> 1k observers (link only)", () => {
    const source = makeNode();
    const leaves = Array.from({ length: 1000 }, makeNode);

    for (const leaf of leaves) {
      linkEdge(leaf, source);
    }
  });

  bench("massive star: unlinkAllObservers (1k)", () => {
    const source = makeNode();
    const leaves = Array.from({ length: 1000 }, makeNode);

    for (const leaf of leaves) {
      linkEdge(leaf, source);
    }

    unlinkAllObservers(source);
  });

  bench("star unlink piecemeal (1k unlinkEdge)", () => {
    const source = makeNode();
    const links = [];

    for (let i = 0; i < 1000; i++) {
      const leaf = makeNode();
      links.push(linkEdge(leaf, source));
    }

    for (const link of links) {
      unlinkEdge(link);
    }
  });

  bench("DAG random graph (100 nodes / 10k edges)", () => {
    const nodes = Array.from({ length: 100 }, makeNode);
    const links = [];

    for (let i = 0; i < 10000; i++) {
      const source = nodes[(Math.random() * nodes.length) | 0]!;
      const observer = nodes[(Math.random() * nodes.length) | 0]!;

      if (source !== observer) {
        links.push(linkEdge(observer, source));
      }
    }

    for (const link of links) {
      unlinkEdge(link);
    }
  });

  bench("degree scan: 1k nodes with random degrees", () => {
    const nodes = Array.from({ length: 1000 }, makeNode);
    const links = [];

    for (let i = 0; i < nodes.length; i++) {
      const source = nodes[i]!;

      for (let j = i + 1; j < Math.min(i + 6, nodes.length); j++) {
        links.push(linkEdge(nodes[j]!, source));
      }
    }

    let total = 0;
    for (const node of nodes) {
      total += node._observerCount;
      total += node._sourceCount;
    }

    if (total === 0) throw new Error("Sanity failed");
  });

  // === контрольная группа ===

  bench("compare: plain array push/pop (1k)", () => {
    const arr: number[] = [];

    for (let i = 0; i < 1000; i++) {
      arr.push(i);
      arr.pop();
    }
  });

  bench("memory snapshot", () => {
    const before = process.memoryUsage().heapUsed;

    const nodes = Array.from({ length: 10000 }, makeNode);
    const links = [];

    for (let i = 0; i < 20000; i++) {
      links.push(
        linkEdge(nodes[i % nodes.length]!, nodes[(i * 3) % nodes.length]!),
      );
    }

    for (const link of links) unlinkEdge(link);

    const after = process.memoryUsage().heapUsed;

    console.log("Used:", (after - before) / 1024, "kb");
    console.log("Pool size:", linkPool.size);
  });
});
