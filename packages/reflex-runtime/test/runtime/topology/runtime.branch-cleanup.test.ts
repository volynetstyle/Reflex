import { beforeEach, describe, expect, it } from "vitest";
import {
  readConsumer,
  readProducer,
  writeProducer,
} from "../../runtime.test_utils";
import {
  createConsumer,
  createProducer,
  expectGraphIntegrity,
  expectNoSubscriber,
  expectSources,
  expectSubscriber,
  resetRuntime,
} from "../../runtime.test_utils";

function createBranchCase(initialGate: boolean) {
  const gate = createProducer(initialGate);
  const left = createProducer(10);
  const right = createProducer(20);
  const selected = createConsumer(() =>
    readProducer(gate) ? readProducer(left) : readProducer(right),
  );

  return { gate, left, right, selected };
}

function interleave<T>(left: T[], right: T[], offset: number): T[] {
  const output: T[] = [];
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    if ((index + offset) % 3 === 0) {
      if (right[index] !== undefined) output.push(right[index]);
      if (left[index] !== undefined) output.push(left[index]);
    } else {
      if (left[index] !== undefined) output.push(left[index]);
      if (right[index] !== undefined) output.push(right[index]);
    }
  }

  return output;
}

function sumPattern(
  pattern: number[],
  sources: ReturnType<typeof createProducer<number>>[],
): number {
  let total = 0;

  for (const sourceIndex of pattern) {
    total += readProducer(sources[sourceIndex]!);
  }

  return total;
}

/** Covers dynamic-branch rewiring and stale dependency cleanup semantics. */
describe("Reactive runtime - branch cleanup matrix", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it.each([
    {
      name: "left -> right",
      initialGate: true,
      nextGate: false,
      activeValue: 20,
      active: "right" as const,
      stale: "left" as const,
    },
    {
      name: "right -> left",
      initialGate: false,
      nextGate: true,
      activeValue: 10,
      active: "left" as const,
      stale: "right" as const,
    },
  ])("$name removes stale edge and keeps active edge", (matrix) => {
    const g = createBranchCase(matrix.initialGate);

    readConsumer(g.selected);
    writeProducer(g.gate, matrix.nextGate);

    expect(readConsumer(g.selected)).toBe(matrix.activeValue);
    expectSources(g.selected, [g.gate, g[matrix.active]]);
    expectSubscriber(g[matrix.active], g.selected);
    expectNoSubscriber(g[matrix.stale], g.selected);
  });

  it("dedupes repeated branch reads while cleaning stale computed branches", () => {
    const head = createProducer(0);
    const double = createConsumer(() => readProducer(head) * 2);
    const inverse = createConsumer(() => -readProducer(head));
    const current = createConsumer(() => {
      let result = 0;

      for (let index = 0; index < 20; index += 1) {
        result +=
          readProducer(head) % 2 ? readConsumer(double) : readConsumer(inverse);
      }

      return result;
    });

    expect(readConsumer(current)).toBe(0);
    expectSources(current, [head, inverse]);

    writeProducer(head, 1);

    expect(readConsumer(current)).toBe(40);
    expectSources(current, [head, double]);
    expectNoSubscriber(inverse, current);
  });

  it("reorders retained dependencies without duplicating source subscriptions", () => {
    const selector = createProducer(0);
    const left = createProducer(10);
    const right = createProducer(20);
    const total = createConsumer(() => {
      if (readProducer(selector) < 1) {
        return readProducer(left) + readProducer(right);
      }

      return readProducer(right) + readProducer(left);
    });

    expect(readConsumer(total)).toBe(30);
    expectSources(total, [selector, left, right]);
    expectSubscriber(left, total);
    expectSubscriber(right, total);

    writeProducer(selector, 1);

    expect(readConsumer(total)).toBe(30);
    expectSources(total, [selector, right, left]);
    expectSubscriber(left, total);
    expectSubscriber(right, total);
    expectGraphIntegrity([selector, left, right, total]);
  });

  it("inserts a dependency between retained prefix and suffix edges", () => {
    const enabled = createProducer(false);
    const left = createProducer(1);
    const middle = createProducer(10);
    const right = createProducer(100);
    const total = createConsumer(() => {
      const leftValue = readProducer(left);
      const middleValue = readProducer(enabled) ? readProducer(middle) : 0;
      const rightValue = readProducer(right);
      return leftValue + middleValue + rightValue;
    });

    expect(readConsumer(total)).toBe(101);
    expectSources(total, [left, enabled, right]);

    writeProducer(enabled, true);

    expect(readConsumer(total)).toBe(111);
    expectSources(total, [left, enabled, middle, right]);
    expectSubscriber(left, total);
    expectSubscriber(middle, total);
    expectSubscriber(right, total);
    expectGraphIntegrity([enabled, left, middle, right, total]);
  });

  it("commits dynamic dependencies after a failed retracking attempt recovers", () => {
    const useRight = createProducer(false);
    const left = createProducer(1);
    const right = createProducer(10);
    let shouldThrow = true;
    let calls = 0;
    const selected = createConsumer(() => {
      calls += 1;
      if (!readProducer(useRight)) return readProducer(left);

      const value = readProducer(right);
      if (shouldThrow) throw new Error("failed branch");
      return value;
    });

    expect(readConsumer(selected)).toBe(1);
    writeProducer(useRight, true);
    expect(() => readConsumer(selected)).toThrow("failed branch");

    shouldThrow = false;
    expect(readConsumer(selected)).toBe(10);
    expectSources(selected, [useRight, right]);
    expectNoSubscriber(left, selected);

    const callsAfterRecovery = calls;
    writeProducer(left, 2);
    expect(readConsumer(selected)).toBe(10);
    expect(calls).toBe(callsAfterRecovery);

    writeProducer(right, 20);
    expect(readConsumer(selected)).toBe(20);
    expect(calls).toBe(callsAfterRecovery + 1);
    expectGraphIntegrity([useRight, left, right, selected]);
  });

  it("reorders retained dependencies while cleaning stale subscriptions", () => {
    const selector = createProducer(0);
    const left = createProducer(10);
    const right = createProducer(20);
    const total = createConsumer(() => {
      if (readProducer(selector) < 1) {
        return readProducer(left) + readProducer(right);
      }

      return readProducer(right);
    });

    expect(readConsumer(total)).toBe(30);
    expectSources(total, [selector, left, right]);
    expectSubscriber(left, total);
    expectSubscriber(right, total);

    writeProducer(selector, 1);

    expect(readConsumer(total)).toBe(20);
    expectSources(total, [selector, right]);
    expectNoSubscriber(left, total);
    expectSubscriber(right, total);
    expectGraphIntegrity([selector, left, right, total]);
  });

  it("stale source write after branch switch does not invalidate, active write does", () => {
    const g = createBranchCase(true);

    expect(readConsumer(g.selected)).toBe(10);
    writeProducer(g.gate, false);
    expect(readConsumer(g.selected)).toBe(20);

    writeProducer(g.left, 11);
    expect(readConsumer(g.selected)).toBe(20);

    writeProducer(g.right, 21);
    expect(readConsumer(g.selected)).toBe(21);
  });

  it("keeps attachment branch-swap shape unique after eager stale-suffix cleanup", () => {
    const deps = 40;
    const selector = createProducer(0);
    const sources = Array.from({ length: deps * 2 }, (_, index) =>
      createProducer(index),
    );
    const patterns = [
      Array.from({ length: deps }, (_, index) => index),
      Array.from({ length: deps }, (_, index) => index + deps),
    ];
    const total = createConsumer(() =>
      sumPattern(patterns[readProducer(selector)]!, sources),
    );

    expect(readConsumer(total)).toBe(780);
    expectSources(total, [
      selector,
      ...patterns[0]!.map((index) => sources[index]!),
    ]);

    writeProducer(selector, 1);

    expect(readConsumer(total)).toBe(2380);
    expectSources(total, [
      selector,
      ...patterns[1]!.map((index) => sources[index]!),
    ]);

    for (const source of patterns[0]!.map((index) => sources[index]!)) {
      expectNoSubscriber(source, total);
    }
    for (const source of patterns[1]!.map((index) => sources[index]!)) {
      expectSubscriber(source, total);
    }

    expectGraphIntegrity([selector, total, ...sources]);
  });

  it("dedupes repeated fresh dependency reads after large branch swap cleanup", () => {
    const deps = 40;
    const selector = createProducer(0);
    const sources = Array.from({ length: deps * 2 }, (_, index) =>
      createProducer(index),
    );
    const patterns = [
      Array.from({ length: deps }, (_, index) => index),
      [...Array.from({ length: deps }, (_, index) => index + deps), deps, deps],
    ];
    const total = createConsumer(() =>
      sumPattern(patterns[readProducer(selector)]!, sources),
    );

    expect(readConsumer(total)).toBe(780);

    writeProducer(selector, 1);

    expect(readConsumer(total)).toBe(2460);
    expectSources(total, [
      selector,
      ...patterns[1]!.slice(0, deps).map((index) => sources[index]!),
    ]);
    expectGraphIntegrity([selector, total, ...sources]);
  });

  it("keeps attachment mixed-churn shape unique while retaining reusable deps", () => {
    const deps = 40;
    const retained = Math.floor(deps * 0.7);
    const churned = deps - retained;
    const selector = createProducer(0);
    const sources = Array.from({ length: deps * 2 }, (_, index) =>
      createProducer(index),
    );
    const patterns = Array.from({ length: 4 }, (_, step) => {
      const stable = Array.from(
        { length: retained },
        (__, index) => (index + step) % retained,
      );
      const moving = Array.from(
        { length: churned },
        (__, index) => retained + ((step * churned + index) % deps),
      );

      return interleave(stable, moving, step);
    });
    const total = createConsumer(() =>
      sumPattern(patterns[readProducer(selector)]!, sources),
    );

    expect(readConsumer(total)).toBe(780);

    for (let step = 1; step < patterns.length; step += 1) {
      writeProducer(selector, step);

      expect(readConsumer(total)).toBe(
        patterns[step]!.reduce((sum, sourceIndex) => sum + sourceIndex, 0),
      );
      expectSources(total, [
        selector,
        ...patterns[step]!.map((index) => sources[index]!),
      ]);
      expectGraphIntegrity([selector, total, ...sources]);
    }
  });
});
