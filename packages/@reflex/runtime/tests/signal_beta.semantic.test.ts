import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRTY_STATE,
  ReactiveNodeState,
  readConsumer,
  readProducer,
  writeProducer,
} from "../src";
import {
  createConsumer,
  createProducer,
  hasSubscriber,
  incomingSources,
  resetRuntime,
} from "./runtime.test_utils";

describe("Reactive runtime - semantic correctness", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("keeps push invalidation lazy until a consumer is actually read", () => {
    const source = createProducer(1);
    const spy = vi.fn(() => readProducer(source) * 2);
    const derived = createConsumer(spy);

    expect(readConsumer(derived)).toBe(2);
    expect(spy).toHaveBeenCalledTimes(1);

    writeProducer(source, 2);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(source.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(derived.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(derived.state & ReactiveNodeState.Changed).toBeFalsy();

    expect(readConsumer(derived)).toBe(4);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(derived.state & DIRTY_STATE).toBe(0);
  });

  it("recomputes only the stale prefix when an upstream result stays same-as-current", () => {
    const source = createProducer(1);
    const stableSpy = vi.fn(() => {
      readProducer(source);
      return 10;
    });
    const stable = createConsumer(stableSpy);
    const leafSpy = vi.fn(() => readConsumer(stable) + 1);
    const leaf = createConsumer(leafSpy);

    expect(readConsumer(leaf)).toBe(11);
    expect(stableSpy).toHaveBeenCalledTimes(1);
    expect(leafSpy).toHaveBeenCalledTimes(1);

    writeProducer(source, 2);

    expect(readConsumer(leaf)).toBe(11);
    expect(stableSpy).toHaveBeenCalledTimes(2);
    expect(leafSpy).toHaveBeenCalledTimes(1);
    expect(leaf.state & DIRTY_STATE).toBe(0);

    expect(readConsumer(leaf)).toBe(11);
    expect(stableSpy).toHaveBeenCalledTimes(2);
    expect(leafSpy).toHaveBeenCalledTimes(1);
  });

  it("prunes stale branch edges after recompute and ignores later writes from that branch", () => {
    const flag = createProducer(true);
    const left = createProducer(1);
    const right = createProducer(10);
    const selectedSpy = vi.fn(() =>
      readProducer(flag) ? readProducer(left) : readProducer(right),
    );
    const selected = createConsumer(selectedSpy);

    expect(readConsumer(selected)).toBe(1);
    expect(incomingSources(selected)).toEqual([flag, left]);
    expect(hasSubscriber(left, selected)).toBe(true);
    expect(hasSubscriber(right, selected)).toBe(false);

    writeProducer(flag, false);

    expect(readConsumer(selected)).toBe(10);
    expect(selectedSpy).toHaveBeenCalledTimes(2);
    expect(incomingSources(selected)).toEqual([flag, right]);
    expect(hasSubscriber(left, selected)).toBe(false);
    expect(hasSubscriber(right, selected)).toBe(true);

    writeProducer(left, 2);

    expect(selected.state & DIRTY_STATE).toBe(0);
    expect(readConsumer(selected)).toBe(10);
    expect(selectedSpy).toHaveBeenCalledTimes(2);

    writeProducer(right, 20);
    expect(readConsumer(selected)).toBe(20);
    expect(selectedSpy).toHaveBeenCalledTimes(3);
  });
});
