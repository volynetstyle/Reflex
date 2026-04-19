import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConsumerReadMode,
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

  it("keeps consumers lazy by default and can initialize them eagerly", () => {
    const source = createProducer(1);
    const spy = vi.fn(() => readProducer(source) * 2);
    const derived = createConsumer(spy);

    expect(spy).not.toHaveBeenCalled();

    expect(readConsumer(derived, ConsumerReadMode.eager)).toBe(2);
    expect(spy).toHaveBeenCalledTimes(1);

    expect(readConsumer(derived)).toBe(2);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("commits producer writes eagerly but defers recomputation until read", () => {
    const source = createProducer(1);
    const spy = vi.fn(() => readProducer(source) * 2);
    const derived = createConsumer(spy);

    expect(readConsumer(derived)).toBe(2);
    expect(spy).toHaveBeenCalledTimes(1);

    writeProducer(source, 2);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(source.state & DIRTY_STATE).toBe(0);
    expect(derived.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(derived.state & ReactiveNodeState.Invalid).toBeFalsy();

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

  it("can eagerly initialize a consumer without subscribing the current consumer", () => {
    const source = createProducer(1);
    const derivedSpy = vi.fn(() => readProducer(source) * 2);
    const derived = createConsumer(derivedSpy);
    const outerSpy = vi.fn(() => {
      readConsumer(derived, ConsumerReadMode.eager);
      return 0;
    });
    const outer = createConsumer(outerSpy);

    expect(readConsumer(outer)).toBe(0);
    expect(derivedSpy).toHaveBeenCalledTimes(1);
    expect(outerSpy).toHaveBeenCalledTimes(1);
    expect(incomingSources(outer)).toEqual([]);
    expect(hasSubscriber(derived, outer)).toBe(false);

    writeProducer(source, 2);

    expect(outer.state & DIRTY_STATE).toBe(0);
    expect(readConsumer(derived)).toBe(4);
    expect(derivedSpy).toHaveBeenCalledTimes(2);
    expect(outerSpy).toHaveBeenCalledTimes(1);
  });

  it("does not let eager stabilization subscribe the current consumer to transitive sources", () => {
    const source = createProducer(1);
    const innerSpy = vi.fn(() => readProducer(source) * 2);
    const inner = createConsumer(innerSpy);
    const outerSpy = vi.fn(() => {
      expect(readConsumer(inner, ConsumerReadMode.eager)).toBe(2);
      return 0;
    });
    const outer = createConsumer(outerSpy);

    expect(readConsumer(outer)).toBe(0);
    expect(innerSpy).toHaveBeenCalledTimes(1);
    expect(outerSpy).toHaveBeenCalledTimes(1);
    expect(incomingSources(outer)).toEqual([]);
    expect(hasSubscriber(source, outer)).toBe(false);

    writeProducer(source, 2);

    expect(outer.state & DIRTY_STATE).toBe(0);
    expect(readConsumer(outer)).toBe(0);
    expect(innerSpy).toHaveBeenCalledTimes(1);
    expect(outerSpy).toHaveBeenCalledTimes(1);
    expect(readConsumer(inner)).toBe(4);
    expect(innerSpy).toHaveBeenCalledTimes(2);
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
