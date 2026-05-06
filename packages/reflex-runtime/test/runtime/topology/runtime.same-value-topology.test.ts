import { beforeEach, describe, expect, it } from "vitest";
import { readConsumer, readProducer, writeProducer } from "../../src";
import {
  createComputeCounter,
  createConsumer,
  createProducer,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers same-value recompute behavior across shared topology. */
describe("Reactive runtime - same-value topology pruning", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("recomputes stable shared dependency but not downstream consumers", () => {
    const counter = createComputeCounter();
    const source = createProducer(1);
    const shared = createConsumer(
      counter.count("shared", () => {
        readProducer(source);
        return 10;
      }),
    );
    const leaf = createConsumer(
      counter.count("leaf", () => readConsumer(shared) + 1),
    );
    const root = createConsumer(
      counter.count("root", () => readConsumer(leaf) + 1),
    );

    expect(readConsumer(root)).toBe(12);
    counter.reset();

    writeProducer(source, 2);

    expect(readConsumer(root)).toBe(12);
    counter.expectOnly({ shared: 1 });
  });

  it("keeps sibling invalid subscribers dirty when shared recomputes same value", () => {
    const counter = createComputeCounter();
    const source = createProducer(1);
    const shared = createConsumer(
      counter.count("shared", () => {
        readProducer(source);
        return 10;
      }),
    );
    const left = createConsumer(
      counter.count("left", () => readConsumer(shared) + 1),
    );
    const right = createConsumer(
      counter.count("right", () => readConsumer(shared) + 2),
    );

    expect(readConsumer(left)).toBe(11);
    expect(readConsumer(right)).toBe(12);
    counter.reset();

    writeProducer(source, 2);

    expect(readConsumer(left)).toBe(11);
    counter.expectOnly({ shared: 1 });
  });
});


