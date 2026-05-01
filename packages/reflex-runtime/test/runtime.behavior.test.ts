import { beforeEach, describe, expect, it } from "vitest";
import { readConsumer, readProducer, writeProducer } from "../src";
import {
  createConsumer,
  createProducer,
  expectClean,
  resetRuntime,
} from "./runtime.test_utils";

describe("Reactive runtime - public behavior guarantees", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("handles producer writes triggered while a consumer is recomputing", () => {
    const a = createProducer(1);
    const b = createProducer(2);
    let reentrant = false;

    const consumer = createConsumer(() => {
      const value = readProducer(a);

      if (value > 5 && !reentrant) {
        reentrant = true;
        writeProducer(b, 99);
      }

      return value;
    });

    writeProducer(a, 10);

    expect(readConsumer(consumer)).toBe(10);
    expect(readProducer(b)).toBe(99);
    expect(reentrant).toBe(true);
  });

  it("reads empty producer payloads without coercion", () => {
    const empty = createProducer(undefined);
    const nullish = createProducer(null);
    const consumer = createConsumer(() => [
      readProducer(empty),
      readProducer(nullish),
    ]);

    expect(readConsumer(consumer)).toEqual([undefined, null]);
  });

  it("coalesces rapid successive writes into the latest observed value", () => {
    const producer = createProducer(0);
    const consumer = createConsumer(() => readProducer(producer));

    expect(readConsumer(consumer)).toBe(0);

    for (let value = 1; value <= 10; value += 1) {
      writeProducer(producer, value);
    }

    expect(readConsumer(consumer)).toBe(10);
    expectClean(consumer);
  });

  it("resolves deeply nested dependency chains lazily", () => {
    const source = createProducer(1);
    let current = createConsumer(() => readProducer(source) + 1);

    for (let index = 1; index < 10; index += 1) {
      const previous = current;
      current = createConsumer(() => readConsumer(previous) + 1);
    }

    expect(readConsumer(current)).toBe(11);
  });
});
