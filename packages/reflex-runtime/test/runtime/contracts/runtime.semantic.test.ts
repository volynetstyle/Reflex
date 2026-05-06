import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsumerReadMode, readConsumer, readProducer, writeProducer } from "../../src";
import {
  createConsumer,
  createComputeCounter,
  createProducer,
  expectChanged,
  expectClean,
  expectNoSubscriber,
  expectNotInvalid,
  expectSources,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers semantic contracts around lazy reads, eager reads, and subscriptions. */
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
    const counter = createComputeCounter();
    const source = createProducer(1);
    const derived = createConsumer(
      counter.count("derived", () => readProducer(source) * 2),
    );

    expect(readConsumer(derived)).toBe(2);
    counter.expectOnce(["derived"]);
    counter.reset();

    writeProducer(source, 2);

    counter.expectNone();
    expectClean(source);
    expectChanged(derived);
    expectNotInvalid(derived);

    expect(readConsumer(derived)).toBe(4);
    counter.expectOnce(["derived"]);
    expectClean(derived);
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
    expectSources(outer, []);
    expectNoSubscriber(derived, outer);

    writeProducer(source, 2);

    expectClean(outer);
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
    expectSources(outer, []);
    expectNoSubscriber(source, outer);

    writeProducer(source, 2);

    expectClean(outer);
    expect(readConsumer(outer)).toBe(0);
    expect(innerSpy).toHaveBeenCalledTimes(1);
    expect(outerSpy).toHaveBeenCalledTimes(1);
    expect(readConsumer(inner)).toBe(4);
    expect(innerSpy).toHaveBeenCalledTimes(2);
  });

});


