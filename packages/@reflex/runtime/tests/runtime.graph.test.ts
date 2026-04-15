import { beforeEach, describe, expect, it } from "vitest";
import {
  disposeNode,
  readConsumer,
  readProducer,
  writeProducer,
} from "../src";
import {
  createConsumer,
  createProducer,
  expectNodeGraphIntegrity,
  hasSubscriber,
  incomingSources,
  resetRuntime,
} from "./runtime.test_utils";

describe("Reactive runtime - graph topology and consistency", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("keeps incoming and outgoing chains bidirectionally consistent after initial tracking", () => {
    const source = createProducer(1);
    const middle = createConsumer(() => readProducer(source) * 2);
    const sink = createConsumer(() => readConsumer(middle) + 1);

    expect(readConsumer(sink)).toBe(3);

    expectNodeGraphIntegrity(source);
    expectNodeGraphIntegrity(middle);
    expectNodeGraphIntegrity(sink);
    expect(hasSubscriber(source, middle)).toBe(true);
    expect(hasSubscriber(middle, sink)).toBe(true);
    expect(incomingSources(sink)).toEqual([middle]);
  });

  it("preserves chain integrity when a branch switch prunes a stale suffix", () => {
    const gate = createProducer(true);
    const left = createProducer(1);
    const right = createProducer(10);
    const selected = createConsumer(() =>
      readProducer(gate) ? readProducer(left) : readProducer(right),
    );

    expect(readConsumer(selected)).toBe(1);
    writeProducer(gate, false);

    expect(readConsumer(selected)).toBe(10);
    expect(incomingSources(selected)).toEqual([gate, right]);
    expect(hasSubscriber(left, selected)).toBe(false);

    expectNodeGraphIntegrity(gate);
    expectNodeGraphIntegrity(left);
    expectNodeGraphIntegrity(right);
    expectNodeGraphIntegrity(selected);
  });

  it("removes both sides of the edge when an intermediate consumer is disposed", () => {
    const source = createProducer(1);
    const middle = createConsumer(() => readProducer(source) * 2);
    const sink = createConsumer(() => readConsumer(middle) + 1);

    expect(readConsumer(sink)).toBe(3);
    disposeNode(middle);

    expect(hasSubscriber(source, middle)).toBe(false);
    expect(hasSubscriber(middle, sink)).toBe(false);
    expect(incomingSources(middle)).toEqual([]);
    expect(incomingSources(sink)).toEqual([]);

    expectNodeGraphIntegrity(source);
    expectNodeGraphIntegrity(middle);
    expectNodeGraphIntegrity(sink);
  });

  it("reuses dependency edges without creating duplicate incoming links", () => {
    const source = createProducer(2);
    const consumer = createConsumer(() => readProducer(source) + readProducer(source));

    expect(readConsumer(consumer)).toBe(4);
    expect(readConsumer(consumer)).toBe(4);

    expect(incomingSources(consumer)).toEqual([source]);
    expectNodeGraphIntegrity(source);
    expectNodeGraphIntegrity(consumer);
  });
});
