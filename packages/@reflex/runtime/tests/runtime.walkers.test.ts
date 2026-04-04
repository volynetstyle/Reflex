import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRTY_STATE,
  ReactiveNode,
  ReactiveNodeState,
  readConsumer,
  readProducer,
  runWatcher,
  setDefaultContext,
  writeProducer,
} from "../src";
import {
  IMMEDIATE,
  propagate,
  propagateOnce,
  shouldRecompute,
} from "../src/reactivity";
import { linkEdge } from "../src/reactivity/shape/methods/connect";
import {
  createConsumer,
  createProducer,
  createTestContext,
  createWatcher,
  hasSubscriber,
  resetRuntime,
} from "./runtime.test_utils";

function createNode(state: number) {
  return new ReactiveNode(undefined, null, state);
}

describe("Reactive runtime - walker invariants", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("propagate marks direct subscribers Changed and deeper descendants Invalid", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const left = createNode(ReactiveNodeState.Consumer);
    const right = createNode(ReactiveNodeState.Consumer);
    const leftLeaf = createNode(ReactiveNodeState.Consumer);
    const rightLeaf = createNode(ReactiveNodeState.Consumer);

    linkEdge(source, left);
    linkEdge(source, right);
    linkEdge(left, leftLeaf);
    linkEdge(right, rightLeaf);

    propagate(source.firstOut!, IMMEDIATE, createTestContext());

    expect(left.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
    expect(right.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
    expect(leftLeaf.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Invalid,
    );
    expect(rightLeaf.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Invalid,
    );
  });

  it("can mark the whole reachable graph Changed when every subscriber is direct", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const left = createNode(ReactiveNodeState.Consumer);
    const right = createNode(ReactiveNodeState.Consumer);
    const watcher = createNode(ReactiveNodeState.Watcher);
    const invalidated: ReactiveNode[] = [];
    const context = createTestContext({
      onEffectInvalidated(node) {
        invalidated.push(node);
      },
    });

    linkEdge(source, left);
    linkEdge(source, right);
    linkEdge(source, watcher);

    propagate(source.firstOut!, IMMEDIATE, context);

    expect(left.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
    expect(right.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
    expect(watcher.state).toBe(ReactiveNodeState.Watcher | ReactiveNodeState.Changed);
    expect(invalidated).toEqual([watcher]);
  });

  it("propagate skips disposed subtrees without aborting sibling traversal", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const disposed = createNode(
      ReactiveNodeState.Consumer | ReactiveNodeState.Disposed,
    );
    const disposedLeaf = createNode(ReactiveNodeState.Consumer);
    const sibling = createNode(ReactiveNodeState.Consumer);

    linkEdge(source, disposed);
    linkEdge(source, sibling);
    linkEdge(disposed, disposedLeaf);

    propagate(source.firstOut!, IMMEDIATE, createTestContext());

    expect(disposed.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Disposed,
    );
    expect(disposedLeaf.state).toBe(ReactiveNodeState.Consumer);
    expect(sibling.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
  });

  it("propagate ignores stale tracked-prefix edges but still resumes sibling branches", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const prefix = createNode(ReactiveNodeState.Producer);
    const tracked = createNode(
      ReactiveNodeState.Consumer | ReactiveNodeState.Tracking,
    );
    const sibling = createNode(ReactiveNodeState.Consumer);

    const prefixEdge = linkEdge(prefix, tracked, null);
    linkEdge(source, tracked);
    linkEdge(source, sibling);
    tracked.depsTail = prefixEdge;

    propagate(source.firstOut!, IMMEDIATE, createTestContext());

    expect(tracked.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Tracking,
    );
    expect(sibling.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
  });

  it("propagate branching accepts depsTail edge without traversing prevIn", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const branch = createNode(ReactiveNodeState.Consumer);
    const sibling = createNode(ReactiveNodeState.Consumer);
    const tracked = createNode(
      ReactiveNodeState.Consumer | ReactiveNodeState.Tracking,
    );

    linkEdge(source, branch);
    linkEdge(source, sibling);
    const trackedEdge = linkEdge(branch, tracked);
    tracked.depsTail = trackedEdge;

    Object.defineProperty(trackedEdge, "prevIn", {
      configurable: true,
      get() {
        throw new Error("branching helper should short-circuit on depsTail");
      },
    });

    expect(() =>
      propagate(source.firstOut!, IMMEDIATE, createTestContext()),
    ).not.toThrow();
    expect(tracked.state).toBe(
      ReactiveNodeState.Consumer |
        ReactiveNodeState.Tracking |
        ReactiveNodeState.Visited |
        ReactiveNodeState.Invalid,
    );
    expect(sibling.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
  });

  it("keeps transitive slow-path subscribers Invalid when only Visited is set", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const middle = createNode(ReactiveNodeState.Consumer);
    const leaf = createNode(
      ReactiveNodeState.Consumer | ReactiveNodeState.Visited,
    );

    linkEdge(source, middle);
    linkEdge(middle, leaf);

    propagate(source.firstOut!, IMMEDIATE, createTestContext());

    expect(middle.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
    expect(leaf.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Invalid,
    );
  });

  it("propagateOnce upgrades only pure Invalid subscribers and notifies watchers once", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const consumer = createNode(
      ReactiveNodeState.Consumer | ReactiveNodeState.Invalid,
    );
    const watcher = createNode(
      ReactiveNodeState.Watcher | ReactiveNodeState.Invalid,
    );
    const alreadyChangedWatcher = createNode(
      ReactiveNodeState.Watcher | ReactiveNodeState.Changed,
    );
    const invalidated: string[] = [];
    const context = createTestContext({
      onEffectInvalidated(node) {
        if (node === watcher) invalidated.push("watcher");
        if (node === alreadyChangedWatcher) invalidated.push("already-changed");
      },
    });

    linkEdge(source, consumer);
    linkEdge(source, watcher);
    linkEdge(source, alreadyChangedWatcher);

    propagateOnce(source, context);

    expect(consumer.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
    expect(watcher.state).toBe(ReactiveNodeState.Watcher | ReactiveNodeState.Changed);
    expect(alreadyChangedWatcher.state).toBe(
      ReactiveNodeState.Watcher | ReactiveNodeState.Changed,
    );
    expect(invalidated).toEqual(["watcher"]);
  });

  it("invalidates every watcher that hangs off a shared computed branch", () => {
    const invalidated: ReactiveNode[] = [];

    resetRuntime({
      onEffectInvalidated(node) {
        invalidated.push(node);
      },
    });

    const source = createProducer(1);
    const shared = createConsumer(() => readProducer(source) * 2);
    const direct = createWatcher(() => {
      readProducer(source);
    });
    const left = createWatcher(() => {
      readConsumer(shared);
    });
    const right = createWatcher(() => {
      readConsumer(shared);
    });

    runWatcher(direct);
    runWatcher(left);
    runWatcher(right);

    expect(hasSubscriber(source, direct)).toBe(true);
    expect(hasSubscriber(source, shared)).toBe(true);
    expect(hasSubscriber(shared, left)).toBe(true);
    expect(hasSubscriber(shared, right)).toBe(true);

    invalidated.length = 0;
    writeProducer(source, 2);

    expect(invalidated).toEqual([direct, left, right]);
  });

  it("still invalidates every watcher when the shared computed was warmed eagerly", () => {
    const invalidated: ReactiveNode[] = [];

    resetRuntime({
      onEffectInvalidated(node) {
        invalidated.push(node);
      },
    });

    const source = createProducer(1);
    const shared = createConsumer(() => readProducer(source) * 2);
    const direct = createWatcher(() => {
      readProducer(source);
    });
    const left = createWatcher(() => {
      readConsumer(shared);
    });
    const right = createWatcher(() => {
      readConsumer(shared);
    });

    expect(readConsumer(shared)).toBe(2);
    runWatcher(direct);
    runWatcher(left);
    runWatcher(right);

    invalidated.length = 0;
    writeProducer(source, 2);

    expect(invalidated).toEqual([left, right, direct]);
  });

  it("shouldRecompute clears Invalid when a dirty dependency recomputes to the same value", () => {
    const source = createProducer(1);
    const sharedSpy = vi.fn(() => {
      readProducer(source);
      return 10;
    });
    const shared = createConsumer(sharedSpy);
    const root = createConsumer(() => readConsumer(shared) + 1);

    expect(readConsumer(root)).toBe(11);

    writeProducer(source, 2);

    expect(shared.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(root.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(shouldRecompute(root)).toBe(false);
    expect(sharedSpy).toHaveBeenCalledTimes(2);
    expect(shared.state & DIRTY_STATE).toBe(0);
    expect(root.state & ReactiveNodeState.Invalid).toBe(0);
  });

  it("shouldRecompute promotes sibling invalid subscribers when a shared dependency is confirmed changed", () => {
    const source = createProducer(1);
    const shared = createConsumer(() => readProducer(source) * 2);
    const left = createConsumer(() => readConsumer(shared) + 1);
    const right = createConsumer(() => readConsumer(shared) + 2);

    expect(readConsumer(left)).toBe(3);
    expect(readConsumer(right)).toBe(4);

    writeProducer(source, 2);

    expect(shared.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(left.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(right.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(shouldRecompute(left)).toBe(true);
    expect(left.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(right.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(right.state & ReactiveNodeState.Invalid).toBeFalsy();
  });

  it("shouldRecompute routes pull-phase invalidations through the caller context", () => {
    const invalidatedA: ReactiveNode[] = [];
    const invalidatedB: ReactiveNode[] = [];
    const contextA = createTestContext({
      onEffectInvalidated(node) {
        invalidatedA.push(node);
      },
    });
    const contextB = createTestContext({
      onEffectInvalidated(node) {
        invalidatedB.push(node);
      },
    });
    const previous = setDefaultContext(contextB);

    try {
      const source = createProducer(1);
      const shared = createConsumer(() => readProducer(source, contextA) * 2);
      const left = createWatcher(() => {
        readConsumer(shared, undefined, contextA);
      });
      const right = createWatcher(() => {
        readConsumer(shared, undefined, contextA);
      });

      runWatcher(left, contextA);
      runWatcher(right, contextA);

      writeProducer(source, 2, Object.is, contextA);
      invalidatedA.length = 0;
      invalidatedB.length = 0;

      runWatcher(left, contextA);

      expect(invalidatedB).toEqual([]);
      expect(invalidatedA).toContain(right);
    } finally {
      setDefaultContext(previous);
    }
  });
});
