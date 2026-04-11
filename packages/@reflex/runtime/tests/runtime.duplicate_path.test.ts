import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRuntimePerfCounters,
  readConsumer,
  readProducer,
  setRuntimePerfCounters,
  writeProducer,
} from "../src";
import {
  createConsumer,
  createProducer,
  incomingSources,
  resetRuntime,
} from "./runtime.test_utils";

describe("Reactive runtime - cursor fast path", () => {
  beforeEach(() => {
    resetRuntime();
  });

  afterEach(() => {
    setRuntimePerfCounters(null);
  });

  it("makes consecutive duplicate reads structurally inert after the first link", () => {
    const counters = createRuntimePerfCounters();
    setRuntimePerfCounters(counters);

    const head = createProducer(1);
    const current = createConsumer(
      () => readProducer(head) + readProducer(head) + readProducer(head),
    );

    expect(readConsumer(current)).toBe(3);
    expect(incomingSources(current)).toEqual([head]);
    expect(counters.trackReadCalls).toBe(1);
    expect(counters.trackReadDuplicateSourceHit).toBeGreaterThanOrEqual(2);

    writeProducer(head, 2);
    expect(readConsumer(current)).toBe(6);
    expect(incomingSources(current)).toEqual([head]);
    expect(counters.trackReadCalls).toBe(1);
  });

  it("reuses stable expected order across passes without re-entering trackReadActive", () => {
    const counters = createRuntimePerfCounters();
    setRuntimePerfCounters(counters);

    const a = createProducer(1);
    const b = createProducer(10);
    const current = createConsumer(() => readProducer(a) + readProducer(b));

    expect(readConsumer(current)).toBe(11);
    expect(incomingSources(current)).toEqual([a, b]);
    expect(counters.trackReadCalls).toBe(2);

    writeProducer(a, 2);
    expect(readConsumer(current)).toBe(12);
    expect(incomingSources(current)).toEqual([a, b]);
    expect(counters.trackReadCalls).toBe(2);
    expect(counters.trackReadExpectedEdgeHit).toBeGreaterThanOrEqual(1);
  });

  it("keeps branch flips correct across passes and prunes stale deps", () => {
    const counters = createRuntimePerfCounters();
    setRuntimePerfCounters(counters);

    const flag = createProducer(true);
    const left = createProducer(2);
    const right = createProducer(7);
    const current = createConsumer(() =>
      readProducer(flag) ? readProducer(left) : readProducer(right),
    );

    expect(readConsumer(current)).toBe(2);
    expect(incomingSources(current)).toEqual([flag, left]);

    writeProducer(flag, false);
    expect(readConsumer(current)).toBe(7);
    expect(incomingSources(current)).toEqual([flag, right]);
    expect(counters.cleanupPassCount).toBeGreaterThanOrEqual(1);
    expect(counters.cleanupStaleEdgeCount).toBeGreaterThanOrEqual(1);

    writeProducer(left, 5);
    expect(readConsumer(current)).toBe(7);
    expect(incomingSources(current)).toEqual([flag, right]);
  });

  it("preserves savings across a deeper nested chain of duplicate reads", () => {
    const counters = createRuntimePerfCounters();
    setRuntimePerfCounters(counters);

    const head = createProducer(1);
    const chain = [createConsumer(() => readProducer(head) + readProducer(head))];

    for (let i = 1; i < 6; i += 1) {
      const prev = chain[i - 1];
      chain.push(createConsumer(() => readConsumer(prev) + readConsumer(prev)));
    }

    const root = chain[chain.length - 1];

    expect(readConsumer(root)).toBe(64);
    expect(counters.trackReadCalls).toBe(6);

    writeProducer(head, 2);
    expect(readConsumer(root)).toBe(128);
    expect(counters.trackReadCalls).toBe(6);
  });
});
