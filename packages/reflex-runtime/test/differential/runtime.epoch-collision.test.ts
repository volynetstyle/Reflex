import { describe, expect, it } from "vitest";

import {
  createConsumer,
  createProducer,
  createWatcher,
  readConsumer,
  readProducer,
  resetRuntimeContext,
  runWatcher,
  setTrackingEpoch,
  writeProducer,
  configureRuntimeContext,
} from "../runtime.test_utils";
import {
  expectGraphIntegrity,
  incomingSources,
  outgoingSubscribers,
} from "../tools/graph/graph-inspector";

/**
 * F13: a pass whose stamp equals a stale stamp still carried by an unvisited
 * edge. Stamps are the only evidence the duplicate-read test has once the
 * 32-edge prefix scan misses, so the stale edge looked already read: the read
 * was dropped and cleanup unlinked the edge, losing the dependency.
 *
 * The consumer first reads `mode` and p0..p39, then `mode` and p0..p34, p38.
 * p38 is neither the next edge, one or two edges further, nor the last edge,
 * so the read reaches the stamp fallback. Each route below makes the second
 * pass reuse the first pass's stamp.
 *
 * `it.fails` records the defective behavior; the fix turns these into `it`.
 */
/** Moves the clock so that the consumer's next pass gets `stale` (with the defect). */
type Route = (stale: number, advanceBy: (passes: number) => void) => void;

const routes: Array<[string, Route]> = [
  [
    "resetRuntimeContext rewinds the clock while nodes survive",
    (stale, advanceBy) => {
      resetRuntimeContext();
      advanceBy(stale - 1);
    },
  ],
  [
    "setTrackingEpoch rewinds the clock",
    (stale) => {
      setTrackingEpoch(stale - 1);
    },
  ],
  [
    "the clock passes 2^32",
    (stale, advanceBy) => {
      // 15 passes reach 2^32 - 1; a wrapping clock then restarts at 1.
      setTrackingEpoch(0xfffffff0);
      advanceBy(15 + stale - 1);
    },
  ],
];

function scenario(route: Route) {
  resetRuntimeContext();
  const notified: unknown[] = [];
  configureRuntimeContext({
    hooks: { onNodeInvalidated: (node) => void notified.push(node) },
  });

  const sources = Array.from({ length: 40 }, (_, i) => createProducer(i));
  const mode = createProducer(0);
  const ticker = createProducer(0);
  const spin = createConsumer(() => readProducer(ticker));
  const first = Array.from({ length: 40 }, (_, i) => i);
  const second = [...first.slice(0, 35), 38];
  let runs = 0;
  const consumer = createConsumer(() => {
    runs++;
    const order = readProducer(mode) === 0 ? first : second;
    let sum = 0;
    for (const i of order) sum += readProducer(sources[i]!);
    return sum;
  });
  const seen: number[] = [];
  const watcher = createWatcher(() => {
    seen.push(readConsumer(consumer) as number);
  });

  runWatcher(watcher);
  expect(seen).toEqual([780]);
  // Every edge accepted by the consumer's pass carries that pass's stamp.
  const stale = consumer.firstIn!.version;

  // Each unrelated recompute is exactly one tracking pass.
  const advanceBy = (passes: number) => {
    for (let i = 0; i < passes; i++) {
      writeProducer(ticker, i + 1);
      readConsumer(spin);
    }
  };

  route(stale, advanceBy);
  configureRuntimeContext({
    hooks: { onNodeInvalidated: (node) => void notified.push(node) },
  });

  writeProducer(mode, 1);
  // This read is the consumer's next pass.
  expect(readConsumer(consumer)).toBe(595 + 38);
  runWatcher(watcher);
  expect(seen.at(-1)).toBe(595 + 38);
  notified.length = 0;

  return { sources, mode, consumer, watcher, notified, seen, runs: () => runs };
}

describe("F13: a repeated pass stamp", () => {
  it.fails.each(routes)(
    "keeps every dependency read in the pass (%s)",
    (_, route) => {
      const { sources, mode, consumer } = scenario(route);

      // Exactly the dependencies of the last execution, in read order.
      expect(incomingSources(consumer)).toEqual([
        mode,
        ...sources.slice(0, 35),
        sources[38],
      ]);
      for (const i of [35, 36, 37, 39]) {
        expect(outgoingSubscribers(sources[i]!)).not.toContain(consumer);
      }
      expect(outgoingSubscribers(sources[38]!)).toEqual([consumer]);
      expectGraphIntegrity([consumer, mode, ...sources]);
    },
  );

  it.fails.each(routes)(
    "invalidates and recomputes after a write to the colliding source (%s)",
    (_, route) => {
      const { sources, consumer, watcher, notified, seen, runs } =
        scenario(route);
      const before = runs();

      writeProducer(sources[38]!, 1000);
      expect(notified).toEqual([watcher]);
      runWatcher(watcher);
      expect(seen.at(-1)).toBe(595 + 1000);
      expect(runs()).toBe(before + 1);

      // A later pass with the same trace keeps the same dependencies.
      writeProducer(sources[38]!, 2000);
      expect(readConsumer(consumer)).toBe(595 + 2000);
      expect(incomingSources(consumer)).toHaveLength(37);
    },
  );
});
