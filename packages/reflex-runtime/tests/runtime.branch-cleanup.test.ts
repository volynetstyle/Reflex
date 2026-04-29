import { beforeEach, describe, expect, it } from "vitest";
import { readConsumer, readProducer, writeProducer } from "../src";
import {
  createConsumer,
  createProducer,
  hasSubscriber,
  incomingSources,
  resetRuntime,
} from "./runtime.test_utils";

function createBranchCase(initialGate: boolean) {
  const gate = createProducer(initialGate);
  const left = createProducer(10);
  const right = createProducer(20);
  const selected = createConsumer(() =>
    readProducer(gate) ? readProducer(left) : readProducer(right),
  );

  return { gate, left, right, selected };
}

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
    expect(incomingSources(g.selected)).toEqual([g.gate, g[matrix.active]]);
    expect(hasSubscriber(g[matrix.active], g.selected)).toBe(true);
    expect(hasSubscriber(g[matrix.stale], g.selected)).toBe(false);
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
    expect(incomingSources(current)).toEqual([head, inverse]);

    writeProducer(head, 1);

    expect(readConsumer(current)).toBe(40);
    expect(incomingSources(current)).toEqual([head, double]);
    expect(hasSubscriber(inverse, current)).toBe(false);
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
});
