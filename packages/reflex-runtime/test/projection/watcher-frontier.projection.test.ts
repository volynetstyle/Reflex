import { expect, it } from "vitest";

import {
  Changed,
  Unknown,
  createConsumer,
  createProducer,
  createWatcher,
  profileRuntime,
  readConsumer,
  readProducer,
  resetRuntime,
  runWatcher,
} from "../runtime.test_utils";
import { pull_frontier } from "../../src/kernel/stages/second/pull_frontier";

it("profiles the complete V3 watcher frontier after an early confirmed change", () => {
  const width = 128;
  resetRuntime();

  const sources = Array.from({ length: width }, () => createProducer(0));
  const leaves = sources.map((source) =>
    createConsumer(() => readProducer(source)),
  );
  const watcher = createWatcher(() => {
    for (const leaf of leaves) readConsumer(leaf);
  });

  runWatcher(watcher);

  watcher.state |= Unknown;
  sources[0]!.payload = 1;
  leaves[0]!.state = (leaves[0]!.state & ~Unknown) | Changed;

  const { counters, value: changed } = profileRuntime(() =>
    pull_frontier(watcher, watcher.firstIn),
  );

  expect(changed).toBe(true);
  expect(counters.watcherFrontierEdgesVisited).toBe(width);
  expect(counters.watcherFrontierChangedDeps).toBe(1);
  expect(counters.watcherFrontierCleanDeps).toBe(width - 1);
  expect(counters.watcherFrontierInvalidDeps).toBe(0);
});
