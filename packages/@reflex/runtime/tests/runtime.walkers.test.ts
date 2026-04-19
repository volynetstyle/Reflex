import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRTY_STATE,
  ReactiveNode,
  ReactiveNodeState,
  readConsumer,
  readProducer,
  restoreContext,
  runWatcher,
  saveContext,
  setHooks,
  writeProducer,
} from "../src";
import {
  PROMOTE_CHANGED,
  propagate,
  propagateOnce,
  shouldRecompute,
} from "../src/reactivity";
import { linkEdge } from "../src/reactivity/shape/methods/connect";
import {
  createConsumer,
  createProducer,
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

    resetRuntime();

    propagate(source.firstOut!, PROMOTE_CHANGED);

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

  it("propagate keeps sibling continuation promote while child descent resets to Invalid", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const left = createNode(ReactiveNodeState.Consumer);
    const right = createNode(ReactiveNodeState.Consumer);
    const leftLeaf = createNode(ReactiveNodeState.Consumer);

    linkEdge(source, left);
    linkEdge(source, right);
    linkEdge(left, leftLeaf);

    resetRuntime();

    propagate(source.firstOut!, PROMOTE_CHANGED);

    expect(left.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
    expect(leftLeaf.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Invalid,
    );
    expect(right.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
  });

  it("can mark the whole reachable graph Changed when every subscriber is direct", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const left = createNode(ReactiveNodeState.Consumer);
    const right = createNode(ReactiveNodeState.Consumer);
    const watcher = createNode(ReactiveNodeState.Watcher);
    const invalidated: ReactiveNode[] = [];
    resetRuntime({
      onSinkInvalidated(node) {
        invalidated.push(node);
      },
    });

    linkEdge(source, left);
    linkEdge(source, right);
    linkEdge(source, watcher);

    propagate(source.firstOut!, PROMOTE_CHANGED);

    expect(left.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
    expect(right.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
    expect(watcher.state).toBe(
      ReactiveNodeState.Watcher | ReactiveNodeState.Changed,
    );
    expect(invalidated).toEqual([watcher]);
  });

  it("propagate skips disposed subtrees without aborting sibling traversal", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const disposed = createNode(
      ReactiveNodeState.Consumer | ReactiveNodeState.Disposed,
    );
    const disposedLeaf = createNode(ReactiveNodeState.Consumer);
    const sibling = createNode(ReactiveNodeState.Consumer);
    resetRuntime();

    linkEdge(source, disposed);
    linkEdge(source, sibling);
    linkEdge(disposed, disposedLeaf);

    propagate(source.firstOut!, PROMOTE_CHANGED);

    expect(disposed.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Disposed,
    );
    expect(disposedLeaf.state).toBe(ReactiveNodeState.Consumer);
    expect(sibling.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
  });

  it("propagate reuses deep branching resume stacks across repeated waves", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const consumers: ReactiveNode[] = [];
    const watchers: ReactiveNode[] = [];
    const invalidated: ReactiveNode[] = [];
    let parent = source;

    resetRuntime({
      onSinkInvalidated(node) {
        invalidated.push(node);
      },
    });

    for (let i = 0; i < 80; i += 1) {
      const next = createNode(ReactiveNodeState.Consumer);
      const watcher = createNode(ReactiveNodeState.Watcher);

      linkEdge(parent, next);
      linkEdge(parent, watcher);
      consumers.push(next);
      watchers.push(watcher);
      parent = next;
    }

    for (let iteration = 0; iteration < 3; iteration += 1) {
      invalidated.length = 0;

      for (const consumer of consumers) {
        consumer.state = ReactiveNodeState.Consumer;
      }

      for (const watcher of watchers) {
        watcher.state = ReactiveNodeState.Watcher;
      }

      propagate(source.firstOut!, PROMOTE_CHANGED);

      expect(invalidated).toHaveLength(watchers.length);
      expect(new Set(invalidated)).toEqual(new Set(watchers));
    }
  });

  it("propagate ignores stale tracked-prefix edges but still resumes sibling branches", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const prefix = createNode(ReactiveNodeState.Producer);
    const tracked = createNode(
      ReactiveNodeState.Consumer | ReactiveNodeState.Tracking,
    );
    const sibling = createNode(ReactiveNodeState.Consumer);
    resetRuntime();

    const prefixEdge = linkEdge(prefix, tracked, null);
    linkEdge(source, tracked);
    linkEdge(source, sibling);
    tracked.lastOutTail = prefixEdge;

    propagate(source.firstOut!, PROMOTE_CHANGED);

    expect(tracked.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Tracking,
    );
    expect(sibling.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
  });

  it("propagate branching accepts lastOutTail edge without traversing prevIn", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const branch = createNode(ReactiveNodeState.Consumer);
    const sibling = createNode(ReactiveNodeState.Consumer);
    const tracked = createNode(
      ReactiveNodeState.Consumer | ReactiveNodeState.Tracking,
    );
    resetRuntime();

    linkEdge(source, branch);
    linkEdge(source, sibling);
    const trackedEdge = linkEdge(branch, tracked);
    tracked.lastOutTail = trackedEdge;

    Object.defineProperty(trackedEdge, "prevIn", {
      configurable: true,
      get() {
        throw new Error("branching helper should short-circuit on lastOutTail");
      },
    });

    expect(() => propagate(source.firstOut!, PROMOTE_CHANGED)).not.toThrow();
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
    resetRuntime();

    linkEdge(source, middle);
    linkEdge(middle, leaf);

    propagate(source.firstOut!, PROMOTE_CHANGED);

    expect(middle.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
    expect(leaf.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Invalid,
    );
  });

  it("clears stale Visited on fast-path subscribers while preserving Changed and Invalid", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const middle = createNode(
      ReactiveNodeState.Consumer | ReactiveNodeState.Visited,
    );
    const leaf = createNode(
      ReactiveNodeState.Consumer | ReactiveNodeState.Visited,
    );
    resetRuntime();

    linkEdge(source, middle);
    linkEdge(middle, leaf);

    propagate(source.firstOut!, PROMOTE_CHANGED);

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
    resetRuntime({
      onSinkInvalidated(node) {
        if (node === watcher) invalidated.push("watcher");
        if (node === alreadyChangedWatcher) invalidated.push("already-changed");
      },
    });

    linkEdge(source, consumer);
    linkEdge(source, watcher);
    linkEdge(source, alreadyChangedWatcher);

    propagateOnce(source);

    expect(consumer.state).toBe(
      ReactiveNodeState.Consumer | ReactiveNodeState.Changed,
    );
    expect(watcher.state).toBe(
      ReactiveNodeState.Watcher | ReactiveNodeState.Changed,
    );
    expect(alreadyChangedWatcher.state).toBe(
      ReactiveNodeState.Watcher | ReactiveNodeState.Changed,
    );
    expect(invalidated).toEqual(["watcher"]);
  });

  it("propagateOnce preserves Visited while upgrading Invalid watchers to Changed", () => {
    const source = createNode(ReactiveNodeState.Producer);
    const watcher = createNode(
      ReactiveNodeState.Watcher |
        ReactiveNodeState.Invalid |
        ReactiveNodeState.Visited,
    );
    const invalidated: ReactiveNode[] = [];
    resetRuntime({
      onSinkInvalidated(node) {
        invalidated.push(node);
      },
    });

    linkEdge(source, watcher);

    propagateOnce(source);

    expect(watcher.state).toBe(
      ReactiveNodeState.Watcher |
        ReactiveNodeState.Changed |
        ReactiveNodeState.Visited,
    );
    expect(invalidated).toEqual([watcher]);
  });

  it("invalidates every watcher that hangs off a shared computed branch", () => {
    const invalidated: ReactiveNode[] = [];

    resetRuntime({
      onSinkInvalidated(node) {
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
      onSinkInvalidated(node) {
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

  it("shouldRecompute reuses deep branching stacks across repeated reads", () => {
    const left = createProducer(1);
    const right = createProducer(2);
    let root = createConsumer(() => readProducer(left) + readProducer(right));

    for (let i = 0; i < 80; i += 1) {
      const prev = root;
      root = createConsumer(() => readConsumer(prev) + 1);
    }

    expect(readConsumer(root)).toBe(83);

    for (let iteration = 0; iteration < 6; iteration += 1) {
      writeProducer(right, iteration + 3);
      expect(readConsumer(root)).toBe(iteration + 84);
    }
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

  it("shouldRecompute does not promote sibling invalid subscribers when a shared dependency recomputes same-as-current", () => {
    const source = createProducer(1);
    const sharedSpy = vi.fn(() => {
      readProducer(source);
      return 10;
    });
    const shared = createConsumer(sharedSpy);
    const left = createConsumer(() => readConsumer(shared) + 1);
    const right = createConsumer(() => readConsumer(shared) + 2);

    expect(readConsumer(left)).toBe(11);
    expect(readConsumer(right)).toBe(12);

    writeProducer(source, 2);

    expect(shared.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(left.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(right.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(shouldRecompute(left)).toBe(false);
    expect(sharedSpy).toHaveBeenCalledTimes(2);
    expect(right.state & ReactiveNodeState.Changed).toBeFalsy();
    expect(right.state & ReactiveNodeState.Invalid).toBeTruthy();
  });

  it("shouldRecompute scans later branching siblings when the first dependency is already clean", () => {
    const leftSource = createProducer(1);
    const rightSource = createProducer(10);
    const leftSpy = vi.fn(() => readProducer(leftSource) + 1);
    const rightSpy = vi.fn(() => readProducer(rightSource) + 1);
    const left = createConsumer(leftSpy);
    const right = createConsumer(rightSpy);
    const root = createConsumer(() => readConsumer(left) + readConsumer(right));

    expect(readConsumer(root)).toBe(13);
    expect(leftSpy).toHaveBeenCalledTimes(1);
    expect(rightSpy).toHaveBeenCalledTimes(1);

    writeProducer(rightSource, 20);

    expect(root.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(left.state & DIRTY_STATE).toBe(0);
    expect(right.state & ReactiveNodeState.Changed).toBeTruthy();
    expect(shouldRecompute(root)).toBe(true);
    expect(leftSpy).toHaveBeenCalledTimes(1);
    expect(rightSpy).toHaveBeenCalledTimes(2);
  });

  it("shouldRecompute clears Invalid when only a later branching sibling recomputes same-as-current", () => {
    const leftSource = createProducer(1);
    const rightSource = createProducer(10);
    const leftSpy = vi.fn(() => readProducer(leftSource) + 1);
    const rightSpy = vi.fn(() => {
      readProducer(rightSource);
      return 20;
    });
    const left = createConsumer(leftSpy);
    const right = createConsumer(rightSpy);
    const root = createConsumer(() => readConsumer(left) + readConsumer(right));

    expect(readConsumer(root)).toBe(22);
    expect(leftSpy).toHaveBeenCalledTimes(1);
    expect(rightSpy).toHaveBeenCalledTimes(1);

    writeProducer(rightSource, 99);

    expect(root.state & ReactiveNodeState.Invalid).toBeTruthy();
    expect(shouldRecompute(root)).toBe(false);
    expect(root.state & ReactiveNodeState.Invalid).toBeFalsy();
    expect(leftSpy).toHaveBeenCalledTimes(1);
    expect(rightSpy).toHaveBeenCalledTimes(2);
  });

  it("shouldRecompute routes pull-phase invalidations through the caller context and back to default", () => {
    const invalidatedA: ReactiveNode[] = [];
    const invalidatedB: ReactiveNode[] = [];
    const snapshot = saveContext();
    setHooks({
      onSinkInvalidated(node) {
        invalidatedA.push(node);
      },
    });

    try {
      const source = createProducer(1);
      const shared = createConsumer(() => readProducer(source) * 2);
      const left = createWatcher(() => {
        readConsumer(shared, undefined);
      });
      const right = createWatcher(() => {
        readConsumer(shared, undefined);
      });

      runWatcher(left);
      runWatcher(right);

      writeProducer(source, 2, Object.is);
      invalidatedA.length = 0;
      invalidatedB.length = 0;

      runWatcher(left);

      expect(invalidatedB).toEqual([]);
      expect(invalidatedA).toContain(right);
    } finally {
      restoreContext(snapshot);
    }
  });
});
