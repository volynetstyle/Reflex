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
import { shouldRecompute } from "../src/reactivity";
import { linkEdge } from "../src/reactivity/shape/methods/connect";
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

  it("marks only immediate subscribers changed when a producer writes", () => {
    const source = createProducer(1);
    const midSpy = vi.fn(() => readProducer(source) * 2);
    const mid = createConsumer(midSpy);
    const leafSpy = vi.fn(() => readConsumer(mid) + 1);
    const leaf = createConsumer(leafSpy);

    expect(readConsumer(leaf)).toBe(3);

    writeProducer(source, 2);

    expect(source.state & DIRTY_STATE).toBe(0);
    expect(mid.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(mid.state & ReactiveNodeState.Invalid).toBeFalsy();
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

  it("coalesces repeated push invalidations across committed writes", () => {
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
    expect(invalidations).toBe(1);

    writeProducer(right, 4);
    expect(invalidations).toBe(1);
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

    writeProducer(stale, 3);
    expect(target.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Tracking,
    );

    writeProducer(tracked, 2);
    expect(target.state & ReactiveNodeState.Tracking).toBeTruthy();
    expect(target.state & ReactiveNodeState.Visited).toBeTruthy();
    expect(target.state & ReactiveNodeState.Changed).toBeFalsy();
    expect(target.state & ReactiveNodeState.Invalid).toBeTruthy();
  });

  it("treats depsTail as the tracked-prefix boundary while computing", () => {
    const first = createProducer(1);
    const second = createProducer(2);
    const stale = createProducer(3);
    const target = createConsumer(() => 0);
    const firstEdge = linkEdge(first, target);
    const secondEdge = linkEdge(second, target);

    linkEdge(stale, target);

    target.state = ReactiveNodeState.Consumer | ReactiveNodeState.Tracking;
    target.depsTail = secondEdge;

    writeProducer(stale, 4);
    expect(target.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Tracking,
    );

    writeProducer(first, 5);
    expect(target.depsTail).toBe(secondEdge);
    expect(firstEdge.nextIn).toBe(secondEdge);
    expect(target.state & ReactiveNodeState.Tracking).toBeTruthy();
    expect(target.state & ReactiveNodeState.Visited).toBeTruthy();
    expect(target.state & ReactiveNodeState.Changed).toBeFalsy();
    expect(target.state & ReactiveNodeState.Invalid).toBeTruthy();
  });

  it("preserves outer propagate traversal when watcher invalidation triggers a nested write", () => {
    let innerSource!: ReturnType<typeof createProducer>;
    let nestedWatcher!: ReturnType<typeof createWatcher>;
    let siblingWatcher!: ReturnType<typeof createWatcher>;
    let innerWatcher!: ReturnType<typeof createWatcher>;
    const invalidations: string[] = [];
    let nestedWriteTriggered = false;

    resetRuntime({
      onEffectInvalidated(node) {
        if (node === nestedWatcher) {
          invalidations.push("nested");

          if (!nestedWriteTriggered) {
            nestedWriteTriggered = true;
            writeProducer(innerSource, 11);
          }

          return;
        }

        if (node === siblingWatcher) {
          invalidations.push("sibling");
          return;
        }

        if (node === innerWatcher) {
          invalidations.push("inner");
        }
      },
    });

    const outerSource = createProducer(1);
    innerSource = createProducer(10);
    const branch = createConsumer(() => readProducer(outerSource) * 2);

    nestedWatcher = createWatcher(() => {
      readConsumer(branch);
    });
    siblingWatcher = createWatcher(() => {
      readProducer(outerSource);
    });
    innerWatcher = createWatcher(() => {
      readProducer(innerSource);
    });

    runWatcher(nestedWatcher);
    runWatcher(siblingWatcher);
    runWatcher(innerWatcher);

    writeProducer(outerSource, 2);

    expect(invalidations).toEqual(["nested", "inner", "sibling"]);
    expect(siblingWatcher.state & DIRTY_STATE).toBeTruthy();
  });

  it("preserves outer dirty-check traversal when recompute reads another invalid consumer", () => {
    const source = createProducer(1);
    const nestedSource = createProducer(10);
    const nested = createConsumer(() => readProducer(nestedSource) * 2);
    const deep = createConsumer(() => readProducer(source) + readConsumer(nested));
    const mid = createConsumer(() => readConsumer(deep) + 1);
    const root = createConsumer(() => readConsumer(mid) + 1);

    expect(readConsumer(root)).toBe(23);

    writeProducer(source, 2);
    writeProducer(nestedSource, 20);

    expect(readConsumer(root)).toBe(44);
    expect(root.state & DIRTY_STATE).toBe(0);
  });

  it("reruns a watcher after a tracked-prefix invalidation during its own execution", () => {
    const source = createProducer(0);
    const seen: number[] = [];
    const watcher = createWatcher(() => {
      const value = readProducer(source);
      seen.push(value);

      if (value < 2) {
        writeProducer(source, value + 1);
      }
    });

    runWatcher(watcher);
    expect(seen).toEqual([0]);
    expect(watcher.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(watcher.state & ReactiveNodeState.Visited).toBeTruthy();

    runWatcher(watcher);
    expect(seen).toEqual([0, 1]);
    expect(watcher.state & ReactiveNodeState.Invalid).toBeTruthy();

    runWatcher(watcher);
    expect(seen).toEqual([0, 1, 2]);
    expect(watcher.state & DIRTY_STATE).toBe(0);
  });

  it("recomputes invalid consumers even when their dependency list is empty", () => {
    const depSpy = vi.fn(() => 1);
    const dep = createConsumer(depSpy);
    const root = createConsumer(() => readConsumer(dep) + 1);

    expect(readConsumer(root)).toBe(2);
    expect(depSpy).toHaveBeenCalledTimes(1);
    expect(dep.firstIn).toBeNull();

    dep.state |= ReactiveNodeState.Invalid;

    expect(shouldRecompute(root)).toBe(false);
    expect(depSpy).toHaveBeenCalledTimes(2);
    expect(dep.state & ReactiveNodeState.Invalid).toBeFalsy();
  });

  it("keeps eager stale-source unlink as the default behavior", () => {
    const toggle = createProducer(true);
    const left = createProducer(1);
    const right = createProducer(2);
    const target = createConsumer(() =>
      readProducer(toggle) ? readProducer(left) : readProducer(right),
    );

    expect(readConsumer(target)).toBe(1);
    expect(hasSubscriber(left, target)).toBe(true);
    expect(hasSubscriber(right, target)).toBe(false);

    writeProducer(toggle, false);

    expect(readConsumer(target)).toBe(2);
    expect(hasSubscriber(left, target)).toBe(false);
    expect(hasSubscriber(right, target)).toBe(true);
  });
});
