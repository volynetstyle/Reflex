import { afterEach, bench, describe } from "vitest";
import { RankedQueue, RankNode } from "../../src/bucket/bucket.queue";

class TestNode<T> implements RankNode<T> {
  nextPeer: TestNode<T> | null = null;
  prevPeer: TestNode<T> | null = null;
  rank = -1;
  data: T;

  constructor(data: T) {
    this.data = data;
  }
}

const N = 2048;

describe("RankedQueue Benchmarks", () => {
  // =========================================================
  // INSERT
  // =========================================================
  bench("insert 2048 random ranks", () => {
    const queue = new RankedQueue<string, TestNode<string>>();

    for (let i = 0; i < N; i++) {
      const node = new TestNode(`n${i}`);
      queue.insert(node, (Math.random() * 1024) | 0);
    }
  });

  // =========================================================
  // POP MIN
  // =========================================================
  bench("popMin 2048", () => {
    const queue = new RankedQueue<string, TestNode<string>>();

    for (let i = 0; i < N; i++) {
      queue.insert(new TestNode(`n${i}`), (Math.random() * 1024) | 0);
    }

    while (!queue.isEmpty()) {
      queue.popMin();
    }
  });

  bench("insert + remove half", () => {
    const queue = new RankedQueue<string, TestNode<string>>();
    const nodes: TestNode<string>[] = [];

    for (let i = 0; i < N; i++) {
      const node = new TestNode(`n${i}`);
      nodes.push(node);
      queue.insert(node, (Math.random() * 1024) | 0);
    }

    for (let i = 0; i < N / 2; i++) {
      queue.remove(nodes[i]!);
    }
  });

  bench("2048 same-rank nodes (worst bucket density)", () => {
    const queue = new RankedQueue<string, TestNode<string>>();

    for (let i = 0; i < N; i++) {
      queue.insert(new TestNode(`n${i}`), 500);
    }

    while (!queue.isEmpty()) {
      queue.popMin();
    }
  });

  bench("mixed workload (insert/pop/remove)", () => {
    const queue = new RankedQueue<string, TestNode<string>>();
    const nodes: TestNode<string>[] = [];

    for (let i = 0; i < N; i++) {
      const node = new TestNode(`n${i}`);
      nodes.push(node);
      queue.insert(node, (Math.random() * 1024) | 0);
    }

    for (let i = 0; i < N / 3; i++) {
      queue.popMin();
    }

    for (let i = 0; i < N / 3; i++) {
      queue.remove(nodes[i]!);
    }
  });
});
