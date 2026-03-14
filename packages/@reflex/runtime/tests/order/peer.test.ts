import { describe, it, expect } from "vitest";
import ReactiveNode from "../../src/reactivity/shape/ReactiveNode";
import {
  insertPeer,
  removePeer,
  order,
} from "../../src/reactivity/walkers/order_maintenance";

function node(rank = 0) {
  const n = new ReactiveNode(0, null);
  n.rank = rank;
  return n;
}

describe("order()", () => {
  it("compares rank correctly", () => {
    const a = node(10);
    const b = node(20);

    expect(order(a, b)).toBe(true);
    expect(order(b, a)).toBe(false);
  });
});

describe("removePeer()", () => {
  it("removes node from chain", () => {
    const a = node(10);
    const b = node(20);
    const c = node(30);

    a.nextPeer = b;
    b.prevPeer = a;

    b.nextPeer = c;
    c.prevPeer = b;

    removePeer(b);

    expect(a.nextPeer).toBe(c);
    expect(c.prevPeer).toBe(a);

    expect(b.nextPeer).toBeNull();
    expect(b.prevPeer).toBeNull();
  });
});

describe("insertPeer()", () => {
  it("inserts node between peers", () => {
    const a = node(10);
    const b = node(20);

    a.nextPeer = b;
    b.prevPeer = a;

    const x = node();

    insertPeer(a, x);

    expect(a.nextPeer).toBe(x);
    expect(x.prevPeer).toBe(a);
    expect(x.nextPeer).toBe(b);
    expect(b.prevPeer).toBe(x);

    expect(x.rank).toBeGreaterThan(a.rank);
    expect(x.rank).toBeLessThan(b.rank);
  });

  it("appends node if no next peer", () => {
    const a = node(10);
    const x = node();

    insertPeer(a, x);

    expect(a.nextPeer).toBe(x);
    expect(x.prevPeer).toBe(a);
    expect(x.nextPeer).toBeNull();
  });

  it("relabels when gap exhausted", () => {
    const a = node(10);
    const b = node(11);

    a.nextPeer = b;
    b.prevPeer = a;

    const x = node();

    insertPeer(a, x);

    expect(x.rank).toBeGreaterThan(a.rank);
    expect(x.rank).toBeLessThan(b.rank);
  });
});
