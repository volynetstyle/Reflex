import { bench, describe } from "vitest";
import { DIRTY_STATE, ReactiveNodeState, Scheduled, Disposed } from "@volynets/reflex-runtime";
import { blackhole } from "./shared";

const CAPACITIES = [16, 32, 64, 256, 1024] as const;
const INNER_ITERATIONS = 2_000_000;

const SCHEDULED_DISPOSED =
  Disposed | Scheduled;

describe("tail update microbench: pure loop", () => {
  for (const capacity of CAPACITIES) {
    const mask = capacity - 1;

    bench(`mod capacity=${capacity}`, () => {
      let tail = 0;
      for (let i = 0; i < INNER_ITERATIONS; ++i) {
        tail = (tail + 1) % capacity;
      }
      blackhole(tail);
    });

    bench(`mask capacity=${capacity}`, () => {
      let tail = 0;
      for (let i = 0; i < INNER_ITERATIONS; ++i) {
        tail = (tail + 1) & mask;
      }
      blackhole(tail);
    });

    bench(`branch capacity=${capacity}`, () => {
      let tail = 0;
      for (let i = 0; i < INNER_ITERATIONS; ++i) {
        tail += 1;
        if (tail === capacity) tail = 0;
      }
      blackhole(tail);
    });
  }
});

describe("tail update microbench: scheduler path", () => {
  for (const capacity of CAPACITIES) {
    const mask = capacity - 1;

    bench(`mod capacity=${capacity}`, () => {
      const queue = new Array<
        { state: number } | undefined
      >(capacity);
      const nodes = Array.from({ length: capacity }, () => ({
        state: DIRTY_STATE,
      }));

      let head = 0;
      let tail = 0;
      let size = 0;

      for (let i = 0; i < INNER_ITERATIONS; ++i) {
        const node = nodes[i & mask]!;
        const state = node.state;
        if ((state & SCHEDULED_DISPOSED) !== 0) continue;

        node.state = state | Scheduled;
        queue[tail] = node;
        tail = (tail + 1) % capacity;
        size += 1;

        if (size === capacity) {
          while (size !== 0) {
            const next = queue[head]!;
            queue[head] = undefined;
            head = (head + 1) % capacity;
            size -= 1;
            next.state &= ~Scheduled;
          }
        }
      }

      while (size !== 0) {
        const next = queue[head]!;
        queue[head] = undefined;
        head = (head + 1) % capacity;
        size -= 1;
        next.state &= ~Scheduled;
      }

      blackhole(head + tail + size);
    });

    bench(`mask capacity=${capacity}`, () => {
      const queue = new Array<
        { state: number } | undefined
      >(capacity);
      const nodes = Array.from({ length: capacity }, () => ({
        state: DIRTY_STATE,
      }));

      let head = 0;
      let tail = 0;
      let size = 0;

      for (let i = 0; i < INNER_ITERATIONS; ++i) {
        const node = nodes[i & mask]!;
        const state = node.state;
        if ((state & SCHEDULED_DISPOSED) !== 0) continue;

        node.state = state | Scheduled;
        queue[tail] = node;
        tail = (tail + 1) & mask;
        size += 1;

        if (size === capacity) {
          while (size !== 0) {
            const next = queue[head]!;
            queue[head] = undefined;
            head = (head + 1) & mask;
            size -= 1;
            next.state &= ~Scheduled;
          }
        }
      }

      while (size !== 0) {
        const next = queue[head]!;
        queue[head] = undefined;
        head = (head + 1) & mask;
        size -= 1;
        next.state &= ~Scheduled;
      }

      blackhole(head + tail + size);
    });

    bench(`branch capacity=${capacity}`, () => {
      const queue = new Array<
        { state: number } | undefined
      >(capacity);
      const nodes = Array.from({ length: capacity }, () => ({
        state: DIRTY_STATE,
      }));

      let head = 0;
      let tail = 0;
      let size = 0;

      for (let i = 0; i < INNER_ITERATIONS; ++i) {
        const node = nodes[i & mask]!;
        const state = node.state;
        if ((state & SCHEDULED_DISPOSED) !== 0) continue;

        node.state = state | Scheduled;
        queue[tail] = node;
        tail += 1;
        if (tail === capacity) tail = 0;
        size += 1;

        if (size === capacity) {
          while (size !== 0) {
            const next = queue[head]!;
            queue[head] = undefined;
            head += 1;
            if (head === capacity) head = 0;
            size -= 1;
            next.state &= ~Scheduled;
          }
        }
      }

      while (size !== 0) {
        const next = queue[head]!;
        queue[head] = undefined;
        head += 1;
        if (head === capacity) head = 0;
        size -= 1;
        next.state &= ~Scheduled;
      }

      blackhole(head + tail + size);
    });
  }
});
