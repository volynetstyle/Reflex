import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Changed,
  Computing,
  DIRTY_STATE,
  Reentrant,
  Tracking,
  disposeNode,
  readConsumer,
  readProducer,
  writeProducer,
} from "../src";
import { connect, disconnect } from "../src/reactivity/shape/graph/connect";
import {
  createConsumer,
  createProducer,
  expectClean,
  expectNoSubscriber,
  expectNotComputing,
  expectNotReentrant,
  expectNotTracking,
  expectSources,
  expectSubscriber,
  resetRuntime,
} from "./runtime.test_utils";

describe("Reactive runtime - lifecycle and state characterization", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("connect is idempotent and disconnect removes the edge from future push invalidation", () => {
    const source = createProducer(1);
    const target = createConsumer(() => 0);

    const first = connect(source, target);
    const second = connect(source, target);

    expect(second).toBe(first);
    expectSources(target, [source]);
    expectSubscriber(source, target);

    disconnect(source, target);

    expectSources(target, []);
    expectNoSubscriber(source, target);

    target.state &= ~DIRTY_STATE;
    writeProducer(source, 2);
    expectClean(target);
  });

  it("disposed consumers are removed from their sources and stop participating in push/pull", () => {
    const source = createProducer(1);
    const spy = vi.fn(() => readProducer(source) * 2);
    const target = createConsumer(spy);

    expect(readConsumer(target)).toBe(2);
    expectSubscriber(source, target);

    disposeNode(target);

    expectClean(target);
    expectSources(target, []);
    expectNoSubscriber(source, target);

    writeProducer(source, 2);

    expectClean(target);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // it("keeps disposed consumers terminal when they are read again", () => {
  //   const source = createProducer(1);
  //   const spy = vi.fn(() => readProducer(source) * 2);
  //   const target = createConsumer(spy);

  //   expect(readConsumer(target)).toBe(2);

  //   disposeNode(target);

  //   expect(readConsumer(target)).toBe(2);
  //   expect(incomingSources(target)).toEqual([]);
  //   expect(hasSubscriber(source, target)).toBe(false);
  //   expect(target.state & DIRTY_STATE).toBe(0);
  //   expect(spy).toHaveBeenCalledTimes(1);

  //   writeProducer(source, 2);

  //   expect(readConsumer(target)).toBe(2);
  //   expect(spy).toHaveBeenCalledTimes(1);
  // });

  it("eagerly detaches downstream subscribers when an intermediate consumer is disposed", () => {
    const source = createProducer(1);
    const middleSpy = vi.fn(() => readProducer(source) * 2);
    const middle = createConsumer(middleSpy);
    const sinkSpy = vi.fn(() => readConsumer(middle) + 1);
    const sink = createConsumer(sinkSpy);

    expect(readConsumer(sink)).toBe(3);
    expectSubscriber(source, middle);
    expectSubscriber(middle, sink);
    expectSources(sink, [middle]);

    disposeNode(middle);

    expectNoSubscriber(source, middle);
    expectNoSubscriber(middle, sink);
    expectSources(middle, []);
    expectSources(sink, []);

    writeProducer(source, 2);

    expectClean(sink);
    expect(middleSpy).toHaveBeenCalledTimes(1);
    expect(sinkSpy).toHaveBeenCalledTimes(1);
  });

  it("characterization: compute executes with Tracking and Computing set, then clears them", () => {
    let target!: ReturnType<typeof createConsumer<number>>;
    let seenInside = 0;

    target = createConsumer(() => {
      seenInside = target.state;
      return 1;
    });

    expect(readConsumer(target)).toBe(1);
    expect(seenInside & Tracking).toBeTruthy();
    expect(seenInside & Computing).toBeTruthy();
    expect(seenInside & Reentrant).toBeFalsy();
    expectNotTracking(target);
    expectNotComputing(target);
  });

  it("characterization: recompute clears a stale Visited bit before compute", () => {
    const source = createProducer(1);
    let target!: ReturnType<typeof createConsumer<number>>;
    let seenInside = 0;

    target = createConsumer(() => {
      seenInside = target.state;
      return readProducer(source) * 3;
    });

    expect(readConsumer(target)).toBe(3);

    target.state |= Reentrant | Changed;

    expect(readConsumer(target)).toBe(3);
    expect(seenInside & Tracking).toBeTruthy();
    expectNotReentrant(target);
    expectClean(target);
  });
});
