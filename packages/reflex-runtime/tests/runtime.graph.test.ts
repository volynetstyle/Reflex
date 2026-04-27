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

  it("keeps repeated branch reads deduped while alternating computed dependencies", () => {
    const head = createProducer(0);
    const double = createConsumer(() => readProducer(head) * 2);
    const inverse = createConsumer(() => -readProducer(head));
    const current = createConsumer(() => {
      let result = 0;

      for (let i = 0; i < 20; i += 1) {
        result += readProducer(head) % 2
          ? readConsumer(double)
          : readConsumer(inverse);
      }

      return result;
    });

    expect(readConsumer(current)).toBe(0);
    expect(incomingSources(current)).toEqual([head, inverse]);
    expect(hasSubscriber(double, current)).toBe(false);

    for (let value = 1; value < 6; value += 1) {
      writeProducer(head, value);

      const expected = value % 2 === 1 ? value * 40 : -value * 20;
      const activeBranch = value % 2 === 1 ? double : inverse;
      const staleBranch = value % 2 === 1 ? inverse : double;

      expect(readConsumer(current)).toBe(expected);
      expect(incomingSources(current)).toEqual([head, activeBranch]);
      expect(hasSubscriber(activeBranch, current)).toBe(true);
      expect(hasSubscriber(staleBranch, current)).toBe(false);

      expectNodeGraphIntegrity(head);
      expectNodeGraphIntegrity(double);
      expectNodeGraphIntegrity(inverse);
      expectNodeGraphIntegrity(current);
    }
  });
});
