import { describe, expect, it } from "vitest";
import { createWatcherNode } from "../src/infra/factory";
import { createWatcherQueue } from "../src/policy/scheduler";

function createNodes(count: number) {
  return Array.from({ length: count }, () => createWatcherNode(() => {}));
}

describe("createWatcherQueue", () => {
  it("starts empty and shifts null", () => {
    const queue = createWatcherQueue();

    expect(queue.size).toBe(0);
    expect(queue.head).toBe(0);
    expect(queue.tail).toBe(0);
    expect(queue.shift()).toBeNull();
  });

  it("preserves FIFO order without growth", () => {
    const queue = createWatcherQueue();
    const nodes = createNodes(4);

    for (const node of nodes) {
      queue.push(node);
    }

    expect(queue.size).toBe(4);
    expect(queue.ring.length).toBe(16);

    for (const node of nodes) {
      expect(queue.shift()).toBe(node);
    }

    expect(queue.size).toBe(0);
    expect(queue.shift()).toBeNull();
  });

  it("grows from the initial capacity and preserves order", () => {
    const queue = createWatcherQueue();
    const nodes = createNodes(20);

    for (const node of nodes) {
      queue.push(node);
    }

    expect(queue.size).toBe(20);
    expect(queue.ring.length).toBe(32);

    for (const node of nodes) {
      expect(queue.shift()).toBe(node);
    }

    expect(queue.size).toBe(0);
  });

  it("preserves FIFO order after wrap-around growth", () => {
    const queue = createWatcherQueue();
    const initial = createNodes(16);
    const wrapped = createNodes(9);

    for (const node of initial) {
      queue.push(node);
    }

    for (const node of initial.slice(0, 8)) {
      expect(queue.shift()).toBe(node);
    }

    for (const node of wrapped) {
      queue.push(node);
    }

    expect(queue.size).toBe(17);
    expect(queue.ring.length).toBe(32);

    for (const node of initial.slice(8)) {
      expect(queue.shift()).toBe(node);
    }

    for (const node of wrapped) {
      expect(queue.shift()).toBe(node);
    }

    expect(queue.size).toBe(0);
  });

  it("clear resets indices and allows reuse", () => {
    const queue = createWatcherQueue();
    const first = createNodes(3);
    const second = createNodes(2);

    for (const node of first) {
      queue.push(node);
    }

    queue.clear();

    expect(queue.size).toBe(0);
    expect(queue.head).toBe(0);
    expect(queue.tail).toBe(0);
    expect(queue.shift()).toBeNull();

    for (const node of second) {
      queue.push(node);
    }

    expect(queue.shift()).toBe(second[0]);
    expect(queue.shift()).toBe(second[1]);
    expect(queue.shift()).toBeNull();
  });
});
