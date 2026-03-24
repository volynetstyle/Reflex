import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRTY_STATE,
  ReactiveNodeState,
  disposeNode,
  readConsumer,
  readProducer,
  writeProducer,
} from "../src";
import {
  connect,
  disconnect,
} from "../src/reactivity/shape/methods/connect";
import {
  createConsumer,
  createProducer,
  hasSubscriber,
  incomingSources,
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
    expect(incomingSources(target)).toEqual([source]);
    expect(hasSubscriber(source, target)).toBe(true);

    disconnect(source, target);

    expect(incomingSources(target)).toEqual([]);
    expect(hasSubscriber(source, target)).toBe(false);

    target.state &= ~DIRTY_STATE;
    writeProducer(source, 2);
    expect(target.state & DIRTY_STATE).toBe(0);
  });

  it("disposed consumers are removed from their sources and stop participating in push/pull", () => {
    const source = createProducer(1);
    const spy = vi.fn(() => readProducer(source) * 2);
    const target = createConsumer(spy);

    expect(readConsumer(target)).toBe(2);
    expect(hasSubscriber(source, target)).toBe(true);

    disposeNode(target);

    expect(target.state & ReactiveNodeState.Disposed).toBeTruthy();
    expect(incomingSources(target)).toEqual([]);
    expect(hasSubscriber(source, target)).toBe(false);

    writeProducer(source, 2);

    expect(target.state & DIRTY_STATE).toBe(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("characterization: compute executes with Tracking and Computing set, then clears them", () => {
    let target!: ReturnType<typeof createConsumer<number>>;
    let seenInside = 0;

    target = createConsumer(() => {
      seenInside = target.state;
      return 1;
    });

    expect(readConsumer(target)).toBe(1);
    expect(seenInside & ReactiveNodeState.Tracking).toBeTruthy();
    expect(seenInside & ReactiveNodeState.Computing).toBeTruthy();
    expect(seenInside & ReactiveNodeState.Visited).toBeFalsy();
    expect(target.state & ReactiveNodeState.Tracking).toBeFalsy();
    expect(target.state & ReactiveNodeState.Computing).toBeFalsy();
  });

  it("characterization: execute clears a stale Visited bit before recompute", () => {
    const source = createProducer(1);
    let target!: ReturnType<typeof createConsumer<number>>;
    let seenInside = 0;

    target = createConsumer(() => {
      seenInside = target.state;
      return readProducer(source) * 3;
    });

    expect(readConsumer(target)).toBe(3);

    target.state |= ReactiveNodeState.Visited | ReactiveNodeState.Changed;

    expect(readConsumer(target)).toBe(3);
    expect(seenInside & ReactiveNodeState.Visited).toBeFalsy();
    expect(seenInside & ReactiveNodeState.Tracking).toBeTruthy();
    expect(target.state & ReactiveNodeState.Visited).toBeFalsy();
    expect(target.state & DIRTY_STATE).toBe(0);
  });
});
