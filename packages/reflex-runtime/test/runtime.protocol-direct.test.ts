import { beforeEach, describe, expect, it } from "vitest";
import {
  CONSUMER_INITIAL_STATE,
  Disposed,
  readConsumer,
  readConsumerEager,
  readConsumerLazy,
  readProducer,
  writeProducer,
} from "../src";
import { recompute } from "../src/reactivity/engine/compute";
import { refreshAndPropagateIfNeeded } from "../src/reactivity/walkers/recompute.refresh";
import {
  createConsumer,
  createProducer,
  hasSubscriber,
  incomingSources,
  resetRuntime,
} from "./runtime.test_utils";

describe("Reactive runtime - direct protocol helpers", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("covers lazy and eager consumer read helpers", () => {
    const source = createProducer(2);
    const lazy = createConsumer(() => readProducer(source) + 1);
    const eager = createConsumer(() => readProducer(source) + 2);
    const parent = createConsumer(() => {
      const lazyValue = readConsumerLazy(lazy);
      const eagerValue = readConsumerEager(eager);
      return lazyValue + eagerValue;
    });

    expect(readConsumer(parent)).toBe(7);
    expect(incomingSources(parent)).toEqual([lazy]);
    expect(hasSubscriber(eager, parent)).toBe(false);
  });

  it("returns payloads without tracking for disposed reads and writes", () => {
    const producer = createProducer(1);
    const consumer = createConsumer(() => 2);

    producer.state |= Disposed;
    consumer.state |= Disposed;

    expect(() => readProducer(producer)).toThrow("read from dead producer");
    expect(() => readConsumer(consumer)).toThrow("read dead consumer");
    expect(() => readConsumerLazy(consumer)).toThrow("read dead consumer");
    expect(() => readConsumerEager(consumer)).toThrow("read dead consumer");

    expect(() => writeProducer(producer, 2)).toThrow("write into dead node");
    expect(producer.payload).toBe(1);
  });

  it("recomputes cleanly after disposal during computation", () => {
    const consumer = createConsumer(() => {
      consumer.state |= Disposed;
      return 42;
    });

    expect(recompute(consumer)).toBe(false);
    expect(consumer.payload).toBeUndefined();
  });

  it("refreshes and propagates only when a recompute changes a fanout node", () => {
    const source = createProducer(1);
    const middle = createConsumer(() => readProducer(source));
    const sink = createConsumer(() => readConsumer(middle));

    expect(readConsumer(sink)).toBe(1);

    middle.state = CONSUMER_INITIAL_STATE;
    writeProducer(source, 2);

    expect(refreshAndPropagateIfNeeded(middle, true)).toBe(true);
    expect(readConsumer(sink)).toBe(2);
  });
});
