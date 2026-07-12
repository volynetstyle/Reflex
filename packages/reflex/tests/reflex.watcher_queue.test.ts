import { describe, expect, it } from "vitest";
import { createWatcherNode } from "../src/infra/factory";
import {
  clearRingQueue,
  createRingQueue,
  pushRingQueue,
  shiftRingQueue,
} from "@volynets/reflex-scheduler";

function createNodes(count: number) {
  return Array.from({ length: count }, () => createWatcherNode(() => {}));
}

describe("createRingQueue", () => {
  it("starts empty and shifts null", () => {
    const queue = createRingQueue();

    expect(queue.tail - queue.head).toBe(0);
    expect(queue.head).toBe(0);
    expect(queue.tail).toBe(0);
    expect(shiftRingQueue(queue)).toBeNull();
  });

  it("preserves FIFO order without growth", () => {
    const queue = createRingQueue();
    const nodes = createNodes(4);

    for (const node of nodes) {
      pushRingQueue(queue, node);
    }

    expect(queue.tail - queue.head).toBe(4);
    expect(queue.ring.length).toBe(16);

    for (const node of nodes) {
      expect(shiftRingQueue(queue)).toBe(node);
    }

    expect(queue.tail - queue.head).toBe(0);
    expect(shiftRingQueue(queue)).toBeNull();
  });

  it("grows from the initial capacity and preserves order", () => {
    const queue = createRingQueue();
    const nodes = createNodes(20);

    for (const node of nodes) {
      pushRingQueue(queue, node);
    }

    expect(queue.tail - queue.head).toBe(20);
    expect(queue.ring.length).toBe(32);

    for (const node of nodes) {
      expect(shiftRingQueue(queue)).toBe(node);
    }

    expect(queue.tail - queue.head).toBe(0);
  });

  it("preserves FIFO order after wrap-around growth", () => {
    const queue = createRingQueue();
    const initial = createNodes(16);
    const wrapped = createNodes(9);

    for (const node of initial) {
      pushRingQueue(queue, node);
    }

    for (const node of initial.slice(0, 8)) {
      expect(shiftRingQueue(queue)).toBe(node);
    }

    for (const node of wrapped) {
      pushRingQueue(queue, node);
    }

    expect(queue.tail - queue.head).toBe(17);
    expect(queue.ring.length).toBe(32);

    for (const node of initial.slice(8)) {
      expect(shiftRingQueue(queue)).toBe(node);
    }

    for (const node of wrapped) {
      expect(shiftRingQueue(queue)).toBe(node);
    }

    expect(queue.tail - queue.head).toBe(0);
  });

  it("clear resets indices and allows reuse", () => {
    const queue = createRingQueue();
    const first = createNodes(3);
    const second = createNodes(2);

    for (const node of first) {
      pushRingQueue(queue, node);
    }

    clearRingQueue(queue);

    expect(queue.tail - queue.head).toBe(0);
    expect(queue.head).toBe(0);
    expect(queue.tail).toBe(0);
    expect(shiftRingQueue(queue)).toBeNull();

    for (const node of second) {
      pushRingQueue(queue, node);
    }

    expect(shiftRingQueue(queue)).toBe(second[0]);
    expect(shiftRingQueue(queue)).toBe(second[1]);
    expect(shiftRingQueue(queue)).toBeNull();
  });
});
