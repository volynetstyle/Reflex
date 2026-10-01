import { beforeEach, describe, expect, it } from "vitest";
import {
  Both,
  createConsumer,
  createProducer,
  createWatcher,
  enterReactiveBatch,
  leaveReactiveBatch,
  profileRuntime,
  readConsumer,
  readProducer,
  resetRuntime,
  runWatcher,
  writeProducer,
} from "../runtime.test_utils";

type Intervention =
  | "none"
  | "read-source"
  | "read-direct"
  | "read-transitive"
  | "link-new"
  | "unlink-old"
  | "relink"
  | "run-watcher"
  | "nested-batch";

function outgoingCount(
  source: ReturnType<typeof createProducer<number>>,
): number {
  let count = 0;
  for (let edge = source.firstOut; edge !== null; edge = edge.nextOut) count++;
  return count;
}

describe("repeated direct fan-out reopen matrix", () => {
  beforeEach(() => resetRuntime());

  it("does not need a second direct watcher notification until execution", () => {
    const source = createProducer(0);
    const observed: number[] = [];
    const watcher = createWatcher(() => {
      observed.push(readProducer(source));
    });
    runWatcher(watcher);

    const repeated = profileRuntime(() => {
      writeProducer(source, 1);
      writeProducer(source, 2);
    });
    expect(repeated.counters.pushDirectEdgesVisited).toBe(2);
    expect(observed).toEqual([0]);

    runWatcher(watcher);
    expect(observed).toEqual([0, 2]);
    const reopened = profileRuntime(() => writeProducer(source, 3));
    expect(reopened.counters.pushDirectEdgesVisited).toBe(1);
    runWatcher(watcher);
    expect(observed).toEqual([0, 2, 3]);
  });

  it.each<{
    intervention: Intervention;
    edgesBeforeSecondWrite: number;
    directDirtyBeforeSecondWrite: boolean;
    finalValue: number;
  }>([
    {
      intervention: "none",
      edgesBeforeSecondWrite: 1,
      directDirtyBeforeSecondWrite: true,
      finalValue: 2,
    },
    {
      intervention: "read-source",
      edgesBeforeSecondWrite: 1,
      directDirtyBeforeSecondWrite: true,
      finalValue: 2,
    },
    {
      intervention: "read-direct",
      edgesBeforeSecondWrite: 1,
      directDirtyBeforeSecondWrite: false,
      finalValue: 2,
    },
    {
      intervention: "read-transitive",
      edgesBeforeSecondWrite: 1,
      directDirtyBeforeSecondWrite: false,
      finalValue: 2,
    },
    {
      intervention: "link-new",
      edgesBeforeSecondWrite: 2,
      directDirtyBeforeSecondWrite: true,
      finalValue: 2,
    },
    {
      intervention: "unlink-old",
      edgesBeforeSecondWrite: 0,
      directDirtyBeforeSecondWrite: false,
      finalValue: 0,
    },
    {
      intervention: "relink",
      edgesBeforeSecondWrite: 1,
      directDirtyBeforeSecondWrite: false,
      finalValue: 2,
    },
    {
      intervention: "run-watcher",
      edgesBeforeSecondWrite: 1,
      directDirtyBeforeSecondWrite: false,
      finalValue: 2,
    },
    {
      intervention: "nested-batch",
      edgesBeforeSecondWrite: 1,
      directDirtyBeforeSecondWrite: true,
      finalValue: 2,
    },
  ])(
    "classifies $intervention",
    ({
      intervention,
      edgesBeforeSecondWrite,
      directDirtyBeforeSecondWrite,
      finalValue,
    }) => {
      const source = createProducer(0);
      const gate = createProducer(true);
      const direct = createConsumer(() =>
        readProducer(gate) ? readProducer(source) : 0,
      );
      const transitive = createConsumer(() => readConsumer(direct));
      const observed: number[] = [];
      const watcher = createWatcher(() => {
        observed.push(readConsumer(transitive));
      });
      runWatcher(watcher);

      if (intervention === "nested-batch") enterReactiveBatch();
      writeProducer(source, 1);

      switch (intervention) {
        case "read-source":
          expect(readProducer(source)).toBe(1);
          break;
        case "read-direct":
          expect(readConsumer(direct)).toBe(1);
          break;
        case "read-transitive":
          expect(readConsumer(transitive)).toBe(1);
          break;
        case "link-new": {
          const linked = createConsumer(() => readProducer(source));
          expect(readConsumer(linked)).toBe(1);
          break;
        }
        case "unlink-old":
          writeProducer(gate, false);
          expect(readConsumer(direct)).toBe(0);
          break;
        case "relink":
          writeProducer(gate, false);
          expect(readConsumer(direct)).toBe(0);
          writeProducer(gate, true);
          expect(readConsumer(direct)).toBe(1);
          break;
        case "run-watcher":
          runWatcher(watcher);
          break;
        case "nested-batch":
          enterReactiveBatch();
          leaveReactiveBatch();
          break;
        case "none":
          break;
      }

      expect(outgoingCount(source)).toBe(edgesBeforeSecondWrite);
      expect((direct.state & Both) !== 0).toBe(directDirtyBeforeSecondWrite);
      const { counters } = profileRuntime(() => writeProducer(source, 2));
      expect(counters.pushDirectEdgesVisited).toBe(edgesBeforeSecondWrite);
      if (intervention === "nested-batch") leaveReactiveBatch();

      runWatcher(watcher);
      expect(readConsumer(transitive)).toBe(finalValue);
      expect(observed.at(-1)).toBe(finalValue);
    },
  );

  it("a failed watcher callback rearms its retained old edge without rereading it", () => {
    const source = createProducer(0);
    let failOnce = true;
    let executions = 0;
    const observed: number[] = [];
    const watcher = createWatcher(() => {
      if (++executions === 2 && failOnce) {
        failOnce = false;
        throw new Error("failed before committing a new trace");
      }
      observed.push(readProducer(source));
    });
    runWatcher(watcher);
    writeProducer(source, 1);
    expect(() => runWatcher(watcher)).toThrow(
      "failed before committing a new trace",
    );
    expect(watcher.state & Both).toBe(0);
    expect(outgoingCount(source)).toBe(1);

    const { counters } = profileRuntime(() => writeProducer(source, 2));
    expect(counters.pushDirectEdgesVisited).toBe(1);
    runWatcher(watcher);
    expect(observed).toEqual([0, 2]);
  });
});
