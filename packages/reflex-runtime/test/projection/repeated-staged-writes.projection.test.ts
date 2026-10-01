import { beforeEach, describe, expect, it } from "vitest";
import {
  createConsumer,
  createProducer,
  createWatcher,
  profileRuntime,
  readConsumer,
  readProducer,
  resetRuntime,
  runWatcher,
  writeProducer,
} from "../runtime.test_utils";

describe("repeated staged writes / push work", () => {
  beforeEach(() => resetRuntime());

  it.each([8, 32])(
    "visits direct fan-out on every changed write at width %i",
    (width) => {
      let notifications = 0;
      resetRuntime({ onNodeInvalidated: () => notifications++ });
      const source = createProducer(0);
      const leaves = Array.from({ length: width }, () =>
        createConsumer(() => readProducer(source)),
      );
      const watchers = leaves.map((leaf) =>
        createWatcher(() => readConsumer(leaf)),
      );
      for (const watcher of watchers) runWatcher(watcher);

      const { counters } = profileRuntime(() => {
        writeProducer(source, 1);
        writeProducer(source, 2);
        writeProducer(source, 3);
      });

      expect(counters.pushDirectEdgesVisited).toBe(width * 3);
      expect(counters.pushTransitiveEdgesVisited).toBe(width);
      expect(counters.pushWatchersInvalidated).toBe(width);
      expect(notifications).toBe(width);
      for (const watcher of watchers) runWatcher(watcher);
      expect(readConsumer(leaves[0]!)).toBe(3);
    },
  );

  it("a read between writes reopens work for that dependency", () => {
    const source = createProducer(0);
    const leaf = createConsumer(() => readProducer(source));
    const watcher = createWatcher(() => readConsumer(leaf));
    runWatcher(watcher);

    const { counters } = profileRuntime(() => {
      writeProducer(source, 1);
      expect(readConsumer(leaf)).toBe(1);
      writeProducer(source, 2);
    });

    expect(counters.pushDirectEdgesVisited).toBe(2);
    expect(counters.pushTransitiveEdgesVisited).toBe(2);
    runWatcher(watcher);
    expect(readConsumer(leaf)).toBe(2);
  });
});
