import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRTY_STATE,
  ReactiveNodeState,
  disposeWatcher,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "../src";
import { linkEdge } from "../src/reactivity/shape/methods/connect";
import { propagateDirectEdge } from "../src/reactivity/walkers/propagate";
import {
  createConsumer,
  createProducer,
  createWatcher,
  hasSubscriber,
  resetRuntime,
} from "./runtime.test_utils";

describe("Reactive runtime - traversal invariants", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("stabilizes a shared upstream node only once per read phase", () => {
    const source = createProducer(1);
    const sharedSpy = vi.fn(() => readProducer(source) * 2);
    const shared = createConsumer(sharedSpy);
    const leftSpy = vi.fn(() => readConsumer(shared) + 1);
    const left = createConsumer(leftSpy);
    const rightSpy = vi.fn(() => readConsumer(shared) + 2);
    const right = createConsumer(rightSpy);
    const sinkSpy = vi.fn(() => readConsumer(left) + readConsumer(right));
    const sink = createConsumer(sinkSpy);

    expect(readConsumer(sink)).toBe(7);
    expect(sharedSpy).toHaveBeenCalledTimes(1);
    expect(leftSpy).toHaveBeenCalledTimes(1);
    expect(rightSpy).toHaveBeenCalledTimes(1);
    expect(sinkSpy).toHaveBeenCalledTimes(1);

    writeProducer(source, 2);

    expect(readConsumer(sink)).toBe(11);
    expect(sharedSpy).toHaveBeenCalledTimes(2);
    expect(leftSpy).toHaveBeenCalledTimes(2);
    expect(rightSpy).toHaveBeenCalledTimes(2);
    expect(sinkSpy).toHaveBeenCalledTimes(2);

    expect(readConsumer(sink)).toBe(11);
    expect(sharedSpy).toHaveBeenCalledTimes(2);
    expect(leftSpy).toHaveBeenCalledTimes(2);
    expect(rightSpy).toHaveBeenCalledTimes(2);
    expect(sinkSpy).toHaveBeenCalledTimes(2);
  });

  it("promotes only immediate invalid subscribers to changed after a source commit", () => {
    const source = createProducer(1);
    const midSpy = vi.fn(() => readProducer(source) * 2);
    const mid = createConsumer(midSpy);
    const leafSpy = vi.fn(() => readConsumer(mid) + 1);
    const leaf = createConsumer(leafSpy);

    expect(readConsumer(leaf)).toBe(3);

    writeProducer(source, 2);

    expect(mid.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(mid.state & ReactiveNodeState.Changed).toBeFalsy();
    expect(leaf.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(leaf.state & ReactiveNodeState.Changed).toBeFalsy();

    expect(readProducer(source)).toBe(2);
    expect(mid.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(mid.state & ReactiveNodeState.Invalid).toBeFalsy();
    expect(leaf.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(leaf.state & ReactiveNodeState.Changed).toBeFalsy();
    expect(midSpy).toHaveBeenCalledTimes(1);
    expect(leafSpy).toHaveBeenCalledTimes(1);
  });

  it("coalesces repeated push invalidations and re-dispatches only on confirmed change", () => {
    let invalidations = 0;
    resetRuntime({
      onEffectInvalidated() {
        invalidations += 1;
      },
    });

    const left = createProducer(1);
    const right = createProducer(2);
    const effectSpy = vi.fn(() => {
      readProducer(left);
      readProducer(right);
    });
    const watcher = createWatcher(effectSpy);

    runWatcher(watcher);
    expect(effectSpy).toHaveBeenCalledTimes(1);

    writeProducer(left, 3);
    writeProducer(right, 4);

    expect(invalidations).toBe(1);
    expect(effectSpy).toHaveBeenCalledTimes(1);
    expect(watcher.state & DIRTY_STATE).toBeTruthy();

    runWatcher(watcher);
    expect(effectSpy).toHaveBeenCalledTimes(2);
    expect(invalidations).toBe(2);

    writeProducer(right, 4);
    expect(invalidations).toBe(2);
  });

  it("removes disposed watchers from future traversals", () => {
    let invalidations = 0;
    resetRuntime({
      onEffectInvalidated() {
        invalidations += 1;
      },
    });

    const source = createProducer(1);
    const effectSpy = vi.fn(() => {
      readProducer(source);
    });
    const watcher = createWatcher(effectSpy);

    runWatcher(watcher);
    expect(hasSubscriber(source, watcher)).toBe(true);

    disposeWatcher(watcher);

    expect(watcher.state & ReactiveNodeState.Disposed).toBeTruthy();
    expect(hasSubscriber(source, watcher)).toBe(false);

    writeProducer(source, 2);
    expect(invalidations).toBe(0);
    expect(effectSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores invalidation from edges outside the current tracked prefix", () => {
    const tracked = createProducer(1);
    const stale = createProducer(2);
    const target = createConsumer(() => 0);
    const trackedEdge = linkEdge(tracked, target);
    const staleEdge = linkEdge(stale, target);

    target.state = ReactiveNodeState.Consumer | ReactiveNodeState.Tracking;
    target.depsTail = trackedEdge;

    propagateDirectEdge(staleEdge);
    expect(target.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Tracking,
    );

    propagateDirectEdge(trackedEdge);
    expect(target.state & ReactiveNodeState.Tracking).toBeTruthy();
    expect(target.state & ReactiveNodeState.Visited).toBeTruthy();
    expect(target.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(target.state & ReactiveNodeState.Invalid).toBeFalsy();
  });
});
