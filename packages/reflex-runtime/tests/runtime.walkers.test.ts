import fc from "fast-check";
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
  Changed,
  Consumer,
  Disposed,
  Invalid,
  Producer,
  PROMOTE_CHANGED,
  propagate,
  propagateOnce,
  Reentrant,
  shouldRecompute,
  Tracking,
  Watcher,
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

type BranchPlan = readonly BranchPlan[];

function attachBranchPlan(
  from: ReactiveNode,
  plan: BranchPlan,
  depth: number,
  levels: ReactiveNode[][],
): void {
  const level = (levels[depth] ??= []);

  for (const childPlan of plan) {
    const child = createNode(Consumer);
    level.push(child);
    linkEdge(from, child);
    attachBranchPlan(child, childPlan, depth + 1, levels);
  }
}

function branchPlanArbitrary(depth: number): fc.Arbitrary<BranchPlan> {
  if (depth === 0) return fc.constant([]);
  return fc.array(branchPlanArbitrary(depth - 1), { maxLength: 3 });
}

describe("Reactive runtime - walker invariants", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("propagate marks direct subscribers Changed and deeper descendants Invalid", () => {
    const source = createNode(Producer);
    const left = createNode(Consumer);
    const right = createNode(Consumer);
    const leftLeaf = createNode(Consumer);
    const rightLeaf = createNode(Consumer);

    linkEdge(source, left);
    linkEdge(source, right);
    linkEdge(left, leftLeaf);
    linkEdge(right, rightLeaf);

    resetRuntime();

    propagate(source.firstOut!, PROMOTE_CHANGED);

    expect(left.state).toBe(
      Consumer | Changed,
    );
    expect(right.state).toBe(
      Consumer | Changed,
    );
    expect(leftLeaf.state).toBe(
      Consumer | Invalid,
    );
    expect(rightLeaf.state).toBe(
      Consumer | Invalid,
    );
  });

  it("propagate keeps sibling continuation promote while child descent resets to Invalid", () => {
    const source = createNode(Producer);
    const left = createNode(Consumer);
    const right = createNode(Consumer);
    const leftLeaf = createNode(Consumer);

    linkEdge(source, left);
    linkEdge(source, right);
    linkEdge(left, leftLeaf);

    resetRuntime();

    propagate(source.firstOut!, PROMOTE_CHANGED);

    expect(left.state).toBe(
      Consumer | Changed,
    );
    expect(leftLeaf.state).toBe(
      Consumer | Invalid,
    );
    expect(right.state).toBe(
      Consumer | Changed,
    );
  });

  it("writeProducer falls back to branching propagation when a direct subscriber has children", () => {
    const source = createProducer(1);
    const mid = createConsumer(() => readProducer(source) + 1);
    const root = createConsumer(() => readConsumer(mid) + 1);

    expect(readConsumer(root)).toBe(3);
    expect(source.outBranchCount).toBe(1);

    writeProducer(source, 2);

    expect(mid.state & Changed).toBeTruthy();
    expect(root.state & Invalid).toBeTruthy();
  });

  it("propagate restores the direct promote only for deferred outer siblings", () => {
    const source = createNode(Producer);
    const left = createNode(Consumer);
    const middle = createNode(Consumer);
    const right = createNode(Consumer);
    const leftA = createNode(Consumer);
    const leftB = createNode(Consumer);
    const leftC = createNode(Consumer);
    const leftLeaf = createNode(Consumer);

    linkEdge(source, left);
    linkEdge(source, middle);
    linkEdge(source, right);
    linkEdge(left, leftA);
    linkEdge(left, leftB);
    linkEdge(left, leftC);
    linkEdge(leftA, leftLeaf);

    resetRuntime();

    propagate(source.firstOut!, PROMOTE_CHANGED);

    expect(left.state).toBe(
      Consumer | Changed,
    );
    expect(middle.state).toBe(
      Consumer | Changed,
    );
    expect(right.state).toBe(
      Consumer | Changed,
    );
    expect(leftA.state).toBe(
      Consumer | Invalid,
    );
    expect(leftB.state).toBe(
      Consumer | Invalid,
    );
    expect(leftC.state).toBe(
      Consumer | Invalid,
    );
    expect(leftLeaf.state).toBe(
      Consumer | Invalid,
    );
  });

  it("propagate keeps direct promote local to depth-0 across generated branching shapes", () => {
    fc.assert(
      fc.property(
        fc.array(branchPlanArbitrary(3), { minLength: 1, maxLength: 4 }),
        (plan) => {
          resetRuntime();
          const source = createNode(Producer);
          const levels: ReactiveNode[][] = [];

          attachBranchPlan(source, plan, 0, levels);
          propagate(source.firstOut!, PROMOTE_CHANGED);

          for (const node of levels[0] ?? []) {
            expect(node.state).toBe(
              Consumer | Changed,
            );
          }

          for (let depth = 1; depth < levels.length; depth += 1) {
            for (const node of levels[depth] ?? []) {
              expect(node.state).toBe(
                Consumer | Invalid,
              );
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("can mark the whole reachable graph Changed when every subscriber is direct", () => {
    const source = createNode(Producer);
    const left = createNode(Consumer);
    const right = createNode(Consumer);
    const watcher = createNode(Watcher);
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
      Consumer | Changed,
    );
    expect(right.state).toBe(
      Consumer | Changed,
    );
    expect(watcher.state).toBe(
      Watcher | Changed,
    );
    expect(invalidated).toEqual([watcher]);
  });

  it("propagate skips disposed subtrees without aborting sibling traversal", () => {
    const source = createNode(Producer);
    const disposed = createNode(
      Consumer | Disposed,
    );
    const disposedLeaf = createNode(Consumer);
    const sibling = createNode(Consumer);
    resetRuntime();

    linkEdge(source, disposed);
    linkEdge(source, sibling);
    linkEdge(disposed, disposedLeaf);

    propagate(source.firstOut!, PROMOTE_CHANGED);

    expect(disposed.state).toBe(
      Consumer | Disposed,
    );
    expect(disposedLeaf.state).toBe(Consumer);
    expect(sibling.state).toBe(
      Consumer | Changed,
    );
  });

  it("propagate reuses deep branching resume stacks across repeated waves", () => {
    const source = createNode(Producer);
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
      const next = createNode(Consumer);
      const watcher = createNode(Watcher);

      linkEdge(parent, next);
      linkEdge(parent, watcher);
      consumers.push(next);
      watchers.push(watcher);
      parent = next;
    }

    for (let iteration = 0; iteration < 3; iteration += 1) {
      invalidated.length = 0;

      for (const consumer of consumers) {
        consumer.state = Consumer;
      }

      for (const watcher of watchers) {
        watcher.state = Watcher;
      }

      propagate(source.firstOut!, PROMOTE_CHANGED);

      expect(invalidated).toHaveLength(watchers.length);
      expect(new Set(invalidated)).toEqual(new Set(watchers));
    }
  });

  it("keeps outer resume stack intact across nested watcher invalidation writes", () => {
    let outerWatcher!: ReactiveNode;
    let innerSource!: ReactiveNode;
    let nestedWrites = 0;

    resetRuntime({
      onSinkInvalidated(node) {
        if (node !== outerWatcher) return;
        nestedWrites += 1;
        writeProducer(innerSource, 1);
      },
    });

    const outerSource = createNode(Producer);
    const outerLeft = createNode(Consumer);
    const outerRight = createNode(Consumer);
    outerWatcher = createNode(Watcher);

    innerSource = createNode(Producer);
    const innerLeft = createNode(Consumer);
    const innerRight = createNode(Consumer);
    const innerLeaf = createNode(Consumer);

    linkEdge(outerSource, outerLeft);
    linkEdge(outerSource, outerRight);
    linkEdge(outerLeft, outerWatcher);

    linkEdge(innerSource, innerLeft);
    linkEdge(innerSource, innerRight);
    linkEdge(innerLeft, innerLeaf);

    writeProducer(outerSource, 1);

    expect(nestedWrites).toBe(1);
    expect(outerLeft.state).toBe(
      Consumer | Changed,
    );
    expect(outerWatcher.state).toBe(
      Watcher | Invalid,
    );
    expect(outerRight.state).toBe(
      Consumer | Changed,
    );
    expect(innerLeft.state).toBe(
      Consumer | Changed,
    );
    expect(innerRight.state).toBe(
      Consumer | Changed,
    );
    expect(innerLeaf.state).toBe(
      Consumer | Invalid,
    );
  });

  it("propagate ignores stale tracked-prefix edges but still resumes sibling branches", () => {
    const source = createNode(Producer);
    const prefix = createNode(Producer);
    const tracked = createNode(
      Consumer | Tracking,
    );
    const sibling = createNode(Consumer);
    resetRuntime();

    const prefixEdge = linkEdge(prefix, tracked, null);
    linkEdge(source, tracked);
    linkEdge(source, sibling);
    tracked.lastInTail = prefixEdge;

    propagate(source.firstOut!, PROMOTE_CHANGED);

    expect(tracked.state).toBe(
      Consumer | Tracking,
    );
    expect(sibling.state).toBe(
      Consumer | Changed,
    );
  });

  it("propagate branching accepts lastInTail edge without traversing prevIn", () => {
    const source = createNode(Producer);
    const branch = createNode(Consumer);
    const sibling = createNode(Consumer);
    const tracked = createNode(
      Consumer | Tracking,
    );
    resetRuntime();

    linkEdge(source, branch);
    linkEdge(source, sibling);
    const trackedEdge = linkEdge(branch, tracked);
    tracked.lastInTail = trackedEdge;

    Object.defineProperty(trackedEdge, "prevIn", {
      configurable: true,
      get() {
        throw new Error("branching helper should short-circuit on lastInTail");
      },
    });

    expect(() => propagate(source.firstOut!, PROMOTE_CHANGED)).not.toThrow();
    expect(tracked.state).toBe(
      Consumer |
        Tracking |
        Reentrant |
        Invalid,
    );
    expect(sibling.state).toBe(
      Consumer | Changed,
    );
  });

  it("keeps transitive slow-path subscribers Invalid when only Visited is set", () => {
    const source = createNode(Producer);
    const middle = createNode(Consumer);
    const leaf = createNode(
      Consumer | Reentrant,
    );
    resetRuntime();

    linkEdge(source, middle);
    linkEdge(middle, leaf);

    propagate(source.firstOut!, PROMOTE_CHANGED);

    expect(middle.state).toBe(
      Consumer | Changed,
    );
    expect(leaf.state).toBe(
      Consumer | Invalid,
    );
  });

  it("clears stale Visited on fast-path subscribers while preserving Changed and Invalid", () => {
    const source = createNode(Producer);
    const middle = createNode(
      Consumer | Reentrant,
    );
    const leaf = createNode(
      Consumer | Reentrant,
    );
    resetRuntime();

    linkEdge(source, middle);
    linkEdge(middle, leaf);

    propagate(source.firstOut!, PROMOTE_CHANGED);

    expect(middle.state).toBe(
      Consumer | Changed,
    );
    expect(leaf.state).toBe(
      Consumer | Invalid,
    );
  });

  it("propagateOnce upgrades only pure Invalid subscribers and notifies watchers once", () => {
    const source = createNode(Producer);
    const consumer = createNode(
      Consumer | Invalid,
    );
    const watcher = createNode(
      Watcher | Invalid,
    );
    const alreadyChangedWatcher = createNode(
      Watcher | Changed,
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
      Consumer | Changed,
    );
    expect(watcher.state).toBe(
      Watcher | Changed,
    );
    expect(alreadyChangedWatcher.state).toBe(
      Watcher | Changed,
    );
    expect(invalidated).toEqual(["watcher"]);
  });

  it("propagateOnce preserves Visited while upgrading Invalid watchers to Changed", () => {
    const source = createNode(Producer);
    const watcher = createNode(
      Watcher |
        Invalid |
        Reentrant,
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
      Watcher |
        Changed |
        Reentrant,
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

    expect(shared.state & Changed).toBeTruthy();
    expect(root.state & Invalid).toBeTruthy();
    expect(shouldRecompute(root)).toBe(false);
    expect(sharedSpy).toHaveBeenCalledTimes(2);
    expect(shared.state & DIRTY_STATE).toBe(0);
    expect(root.state & Invalid).toBe(0);
  });

  it("shouldRecompute clears Invalid across a deep linear chain when the leaf recomputes same-as-current", () => {
    const source = createProducer(1);
    const leafSpy = vi.fn(() => {
      readProducer(source);
      return 10;
    });
    const leaf = createConsumer(leafSpy);
    const mid = createConsumer(() => readConsumer(leaf) + 1);
    const root = createConsumer(() => readConsumer(mid) + 1);

    expect(readConsumer(root)).toBe(12);

    writeProducer(source, 2);

    expect(shouldRecompute(root)).toBe(false);
    expect(leafSpy).toHaveBeenCalledTimes(2);
    expect(leaf.state & DIRTY_STATE).toBe(0);
    expect(mid.state & Invalid).toBe(0);
    expect(root.state & Invalid).toBe(0);
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

    expect(shared.state & Changed).toBeTruthy();
    expect(left.state & Invalid).toBeTruthy();
    expect(right.state & Invalid).toBeTruthy();
    expect(shouldRecompute(left)).toBe(true);
    expect(left.state & Changed).toBeTruthy();
    expect(right.state & Changed).toBeTruthy();
    expect(right.state & Invalid).toBeFalsy();
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

    expect(shared.state & Changed).toBeTruthy();
    expect(left.state & Invalid).toBeTruthy();
    expect(right.state & Invalid).toBeTruthy();
    expect(shouldRecompute(left)).toBe(false);
    expect(sharedSpy).toHaveBeenCalledTimes(2);
    expect(right.state & Changed).toBeFalsy();
    expect(right.state & Invalid).toBeTruthy();
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

    expect(root.state & Invalid).toBeTruthy();
    expect(left.state & DIRTY_STATE).toBe(0);
    expect(right.state & Changed).toBeTruthy();
    expect(shouldRecompute(root)).toBe(true);
    expect(leftSpy).toHaveBeenCalledTimes(1);
    expect(rightSpy).toHaveBeenCalledTimes(2);
  });

  it("shouldRecompute preserves outer stack frames across nested dirty reads", () => {
    const source = createProducer(1);
    const rightSource = createProducer(10);
    const nestedSource = createProducer(100);

    const nestedDeep = createConsumer(() => {
      readProducer(nestedSource);
      return 5;
    });
    const nestedMid = createConsumer(() => readConsumer(nestedDeep));
    const nestedRoot = createConsumer(() => readConsumer(nestedMid));

    const deep = createConsumer(() => {
      readConsumer(nestedRoot);
      readProducer(source);
      return 1;
    });
    const mid = createConsumer(() => readConsumer(deep));
    const parent = createConsumer(() => readConsumer(mid));
    const right = createConsumer(() => readProducer(rightSource));
    const root = createConsumer(() => readConsumer(parent) + readConsumer(right));

    expect(readConsumer(root)).toBe(11);

    writeProducer(source, 2);
    writeProducer(nestedSource, 200);
    writeProducer(rightSource, 20);

    expect(readConsumer(root)).toBe(21);
    expect(root.state & DIRTY_STATE).toBe(0);
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

    expect(root.state & Invalid).toBeTruthy();
    expect(shouldRecompute(root)).toBe(false);
    expect(root.state & Invalid).toBeFalsy();
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
