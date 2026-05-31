import { beforeEach, describe, expect, it } from "vitest";
import {
  CONSUMER_INITIAL_STATE,
  readConsumer,
  readConsumerEager,
  readConsumerLazy,
  readProducer,
  writeProducer,
} from "../../runtime.test_utils";
import { recompute } from "../../../src/kernel/engine/recompute";
import { refreshAndPropagateIfNeeded } from "../../../src/kernel/walkers/ensureFresh";
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

    expect(recompute(consumer)).toBe(true);
    expect(consumer.payload).toBe(42);
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
