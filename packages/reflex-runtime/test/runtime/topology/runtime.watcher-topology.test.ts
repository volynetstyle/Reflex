import { beforeEach, describe, expect, it } from "vitest";
import {
  DIRTY_STATE,
  disposeWatcher,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "../../src";
import {
  createConsumer,
  createProducer,
  createWatcher,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers watcher invalidation cardinality across direct and shared fanout. */
describe("Reactive runtime - watcher topology invalidation cardinality", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("direct watcher fanout invalidates each watcher once", () => {
    const invalidated: string[] = [];
    const source = createProducer(1);
    const watchers = ["left", "right", "far"].map((label) => {
      const watcher = createWatcher(() => {
        readProducer(source);
      });
      return { label, watcher };
    });

    resetRuntime({
      onSinkInvalidated(node) {
        const hit = watchers.find((entry) => entry.watcher === node);
        if (hit) invalidated.push(hit.label);
      },
    });

    for (const { watcher } of watchers) {
      runWatcher(watcher);
    }

    writeProducer(source, 2);
    writeProducer(source, 3);

    expect(invalidated).toEqual(["left", "right", "far"]);
    for (const { watcher } of watchers) {
      expect(watcher.state & DIRTY_STATE).toBeTruthy();
    }
  });

  it("watchers through a shared computed invalidate once each", () => {
    const invalidated: string[] = [];
    const source = createProducer(1);
    const shared = createConsumer(() => readProducer(source) * 2);
    const left = createWatcher(() => {
      readConsumer(shared);
    });
    const right = createWatcher(() => {
      readConsumer(shared);
    });

    resetRuntime({
      onSinkInvalidated(node) {
        if (node === left) invalidated.push("left");
        if (node === right) invalidated.push("right");
      },
    });

    runWatcher(left);
    runWatcher(right);

    writeProducer(source, 2);
    writeProducer(source, 3);

    expect(invalidated).toEqual(["left", "right"]);
  });

  it("nested watcher invalidation does not duplicate the outer queue", () => {
    let innerSource!: ReturnType<typeof createProducer>;
    let outerWatcher!: ReturnType<typeof createWatcher>;
    let innerWatcher!: ReturnType<typeof createWatcher>;
    const invalidated: string[] = [];
    let nestedWriteTriggered = false;

    resetRuntime({
      onSinkInvalidated(node) {
        if (node === outerWatcher) {
          invalidated.push("outer");
          if (!nestedWriteTriggered) {
            nestedWriteTriggered = true;
            writeProducer(innerSource, 2);
          }
        }

        if (node === innerWatcher) {
          invalidated.push("inner");
        }
      },
    });

    const outerSource = createProducer(1);
    innerSource = createProducer(1);
    outerWatcher = createWatcher(() => {
      readProducer(outerSource);
    });
    innerWatcher = createWatcher(() => {
      readProducer(innerSource);
    });

    runWatcher(outerWatcher);
    runWatcher(innerWatcher);

    writeProducer(outerSource, 2);

    expect(invalidated).toEqual(["outer", "inner"]);
  });

  it("disposed watcher does not participate in future invalidations", () => {
    const source = createProducer(1);
    let invalidations = 0;
    const watcher = createWatcher(() => {
      readProducer(source);
    });

    resetRuntime({
      onSinkInvalidated() {
        invalidations += 1;
      },
    });

    runWatcher(watcher);
    disposeWatcher(watcher);
    writeProducer(source, 2);

    expect(invalidations).toBe(0);
  });
});


