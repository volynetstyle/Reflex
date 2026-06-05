import { beforeEach, describe, expect, it } from "vitest";
import {
  advance,
  CONSUMER_INITIAL_STATE,
  readConsumer,
  readConsumerEager,
  readConsumerLazy,
  readProducer,
  writeProducer,
} from "../../runtime.test_utils";
import {
  createConsumer,
  createProducer,
  hasSubscriber,
  incomingSources,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers direct helper APIs that expose protocol-level runtime behavior. */
describe("Reactive runtime - direct protocol helpers", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("covers lazy and eager consumer read helpers", () => {
    const source = createProducer(2);
    const lazy = createConsumer(() => readProducer(source) + 1);
    const eager = createConsumer(() => readProducer(source) + 2);
    const parent = createConsumer(() => {
      const lazyValue = readConsumerLazy.call(lazy) as number;
      const eagerValue = readConsumerEager(eager);
      return lazyValue + eagerValue;
    });

    expect(readConsumer(parent)).toBe(7);
    expect(incomingSources(parent)).toEqual([lazy]);
    expect(hasSubscriber(eager, parent)).toBe(false);
  });

  it("recomputes cleanly after state changes during computation", () => {
    const consumer = createConsumer(() => {
      consumer.state = CONSUMER_INITIAL_STATE;
      return 42;
    });

    expect(advance(consumer)).toBe(true);
    expect(consumer.payload).toBe(42);
  });
});
