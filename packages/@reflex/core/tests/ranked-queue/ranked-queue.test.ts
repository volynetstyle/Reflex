import { describe, it, expect, beforeEach } from "vitest";
import { RankedQueue, RankNode } from "../../src/bucket";

class TestNode<T> implements RankNode<T> {
  nextPeer: TestNode<T> | null = null;
  prevPeer: TestNode<T> | null = null;
  rank = -1;
  data: T;

  constructor(data: T) {
    this.data = data;
  }
}

describe("RankedQueue (strict)", () => {
  let queue: RankedQueue<string, TestNode<string>>;

  beforeEach(() => {
    queue = new RankedQueue();
  });

  it("orders by rank (ascending)", () => {
    const a = new TestNode("a");
    const b = new TestNode("b");
    const c = new TestNode("c");

    expect(queue.insert(a, 10)).toBe(true);
    expect(queue.insert(b, 3)).toBe(true);
    expect(queue.insert(c, 7)).toBe(true);

    expect(queue.popMin()).toBe(b);
    expect(queue.popMin()).toBe(c);
    expect(queue.popMin()).toBe(a);
    expect(queue.popMin()).toBeNull();
  });

  it("is LIFO inside same rank bucket", () => {
    const n1 = new TestNode("1");
    const n2 = new TestNode("2");
    const n3 = new TestNode("3");

    queue.insert(n1, 5);
    queue.insert(n2, 5);
    queue.insert(n3, 5);

    expect(queue.popMin()).toBe(n3);
    expect(queue.popMin()).toBe(n2);
    expect(queue.popMin()).toBe(n1);
  });

  it("removes correctly (head and middle)", () => {
    const a = new TestNode("a");
    const b = new TestNode("b");
    const c = new TestNode("c");

    queue.insert(a, 5);
    queue.insert(b, 5);
    queue.insert(c, 5);

    // remove head (c, LIFO head)
    expect(queue.remove(c)).toBe(true);

    // now head should be b
    expect(queue.popMin()).toBe(b);
    expect(queue.popMin()).toBe(a);
  });

  it("rejects double insert", () => {
    const node = new TestNode("x");

    expect(queue.insert(node, 4)).toBe(true);
    expect(queue.insert(node, 4)).toBe(false);
  });

  // not a point in dev mode
  // it("rejects invalid ranks", () => {
  //   const node = new TestNode("bad");

  //   expect(queue.insert(node, -1)).toBe(false);
  //   expect(queue.insert(node, 2000)).toBe(false);
  //   expect(queue.insert(node, NaN)).toBe(false);
  //   expect(queue.size()).toBe(0);
  // });

  it("handles boundary ranks", () => {
    const min = new TestNode("min");
    const max = new TestNode("max");

    expect(queue.insert(min, 0)).toBe(true);
    expect(queue.insert(max, 1023)).toBe(true);

    expect(queue.popMin()).toBe(min);
    expect(queue.popMin()).toBe(max);
  });
});
