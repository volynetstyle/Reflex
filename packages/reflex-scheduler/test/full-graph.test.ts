import { afterEach, describe, expect, it } from "vitest";
import {
  configureRuntimeContext,
  createConsumer,
  createProducer,
  createWatcher,
  readConsumer,
  readProducer,
  resetRuntimeContext,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime/internal";
import {
  createEagerScheduler,
  createFlushScheduler,
  createSabScheduler,
  type EffectScheduler,
} from "../src";

const SOURCE_COUNT = 32;

function createGraph(scheduler: EffectScheduler) {
  configureRuntimeContext({
    hooks: {
      onNodeInvalidated: scheduler.enqueue,
      onRuntimeIdle: scheduler.runtimeNotifySettled,
    },
  });

  const sources = Array.from({ length: SOURCE_COUNT }, (_, index) =>
    createProducer(index),
  );
  const leaves = sources.map((source, index) =>
    createConsumer(() => readProducer(source) + index),
  );
  const root = createConsumer(() => {
    let total = 0;
    for (const leaf of leaves) total += readConsumer(leaf);
    return total;
  });
  let effectRuns = 0;
  const watcher = createWatcher(() => {
    effectRuns += 1;
    readConsumer(root);
  });
  runWatcher(watcher);

  const values = Array.from({ length: SOURCE_COUNT }, (_, index) => index);
  const expected = () =>
    values.reduce((total, value, index) => total + value + index, 0);
  const write = (index: number, value: number) => {
    values[index] = value;
    writeProducer(sources[index]!, value);
  };

  return { root, write, expected, effectRuns: () => effectRuns };
}

afterEach(() => resetRuntimeContext());

describe.each([
  ["flush", createFlushScheduler],
  ["eager", createEagerScheduler],
  ["sab", createSabScheduler],
] as const)("%s scheduler full graph", (_name, createScheduler) => {
  it("dedupes writes from one source inside an outer batch", () => {
    const scheduler = createScheduler();
    const graph = createGraph(scheduler);
    const initialRuns = graph.effectRuns();

    scheduler.batch(() => {
      graph.write(0, 100);
      graph.write(0, 101);
      graph.write(0, 102);
    });
    scheduler.flush();

    expect(readConsumer(graph.root)).toBe(graph.expected());
    expect(graph.effectRuns()).toBe(initialRuns + 1);
  });

  it("keeps the graph correct for rotating dirty sources", () => {
    const scheduler = createScheduler();
    const graph = createGraph(scheduler);

    for (let iteration = 0; iteration < SOURCE_COUNT * 2; iteration += 1) {
      const source = iteration % SOURCE_COUNT;
      scheduler.batch(() => graph.write(source, 1_000 + iteration));
      scheduler.flush();
      expect(readConsumer(graph.root)).toBe(graph.expected());
    }
  });

  it("allows a final pull read while watcher work is still queued", () => {
    const scheduler = createScheduler();
    const graph = createGraph(scheduler);

    graph.write(0, 500);
    graph.write(1, 600);

    expect(readConsumer(graph.root)).toBe(graph.expected());
    scheduler.flush();
    expect(readConsumer(graph.root)).toBe(graph.expected());
  });
});
