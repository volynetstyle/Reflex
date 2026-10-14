import { beforeEach, describe, expect, it } from "vitest";
import * as pullModule from "../../../src/kernel/stages/second/pull_dependency";
import {
  createConsumer,
  createProducer,
  createWatcher,
} from "../../../src/protocol/create.node";
import { readConsumer } from "../../../src/protocol/read.consumer";
import { readProducer } from "../../../src/protocol/read.producer";
import { writeProducer } from "../../../src/protocol/write.producer";
import { runWatcher } from "../../../src/protocol/watcher";
import {
  currentConsumer,
  propagationScopeDepth,
} from "../../../src/kernel/state";
import {
  configureRuntimeContext,
  createRuntimeContext,
  resetRuntimeContext,
  runWithRuntimeContext,
} from "../../../src/kernel/context";
import type { ReactiveEdge } from "../../../src/kernel/shape";

const pullState = pullModule as typeof pullModule & {
  testPullStack: Array<ReactiveEdge | null>;
  testPullHigh: number;
};

function chain(depth: number, leaf: () => number) {
  let node = createConsumer(leaf);
  for (let i = 1; i < depth; i++) {
    const below = node;
    node = createConsumer(() => readConsumer(below) + 1);
  }
  return node;
}

/** E3: shared reentrant walker stacks survive nested domain entries. */
describe("Reactive runtime - walker continuations across domains", () => {
  beforeEach(() => {
    resetRuntimeContext();
  });

  it("A pull -> B pull (throws) -> A resume keeps both continuations", () => {
    const a = createRuntimeContext();
    const b = createRuntimeContext();
    const aSource = createProducer(1);
    const bSource = createProducer(100);
    let bThrows = false;
    const bRoot = chain(8, () => {
      const value = readProducer(bSource);
      if (bThrows) throw new Error("b failed");
      return value;
    });
    const bOutcomes: Array<number | string> = [];
    const aRoot = chain(8, () => {
      const value = readProducer(aSource);
      runWithRuntimeContext(b, () => {
        try {
          bOutcomes.push(readConsumer(bRoot));
        } catch (error) {
          bOutcomes.push((error as Error).message);
        }
      });
      return value;
    });
    const base = pullState.testPullHigh;

    runWithRuntimeContext(a, () => {
      expect(readConsumer(aRoot)).toBe(8);

      bThrows = true;
      writeProducer(bSource, 200);
      writeProducer(aSource, 2);
      expect(readConsumer(aRoot)).toBe(9);

      bThrows = false;
      writeProducer(bSource, 300);
      writeProducer(aSource, 3);
      expect(readConsumer(aRoot)).toBe(10);
    });

    expect(bOutcomes).toEqual([107, "b failed", 307]);
    expect(pullState.testPullHigh).toBe(base);
    expect(
      pullState.testPullStack.slice(base).every((edge) => edge == null),
    ).toBe(true);
    expect(currentConsumer).toBeNull();
  });

  it("A propagation -> B write -> return A delivers each hook to its domain", () => {
    const a = createRuntimeContext();
    const b = createRuntimeContext();
    const aSource = createProducer(0);
    const bSource = createProducer(0);
    const aWatchers = Array.from({ length: 4 }, () =>
      createWatcher(() => void readProducer(aSource)),
    );
    const bWatcher = createWatcher(() => void readProducer(bSource));
    const aQueue: unknown[] = [];
    const bQueue: unknown[] = [];

    configureRuntimeContext(b, {
      hooks: { onNodeInvalidated: (node) => bQueue.push(node) },
    });
    configureRuntimeContext(a, {
      hooks: {
        onNodeInvalidated(node) {
          aQueue.push(node);
          if (aQueue.length === 2) {
            runWithRuntimeContext(b, () => writeProducer(bSource, 1));
          }
        },
      },
    });

    runWithRuntimeContext(b, () => runWatcher(bWatcher));
    runWithRuntimeContext(a, () => {
      for (const watcher of aWatchers) runWatcher(watcher);
      writeProducer(aSource, 1);
      expect(propagationScopeDepth).toBe(0);
    });

    expect(new Set(aQueue)).toEqual(new Set(aWatchers));
    expect(bQueue).toEqual([bWatcher]);
  });
});
