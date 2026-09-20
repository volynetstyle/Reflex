import { beforeEach, describe, expect, it } from "vitest";
import {
  Both,
  Changed,
  Computing,
  Scheduled,
  Unknown,
  Visited,
  claimWatcherSchedule,
  createConsumer,
  createProducer,
  createWatcher,
  readConsumer,
  readProducer,
  releaseWatcherSchedule,
  runWatcher,
  validateDependencies,
  writeProducer,
} from "../../runtime.test_utils";
import { resetRuntime } from "../../runtime.test_utils";

describe("Reactive runtime - transactional watcher validation", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it.each([0, 1, 2])(
    "records invalidation through committed edge %i when tailIn spans the frontier",
    (invalidatedIndex) => {
      const markerSources = [
        createProducer(0),
        createProducer(0),
        createProducer(0),
      ];
      const triggerSource = createProducer(0);
      let invalidateDuringValidation = false;
      const trigger = createConsumer(() => {
        readProducer(triggerSource);
        if (invalidateDuringValidation) {
          invalidateDuringValidation = false;
          writeProducer(markerSources[invalidatedIndex]!, 1);
        }
        return 0;
      });
      const watcher = createWatcher(() => {
        readConsumer(trigger);
        for (const source of markerSources) readProducer(source);
      });

      runWatcher(watcher);
      const committedTail = watcher.tailIn;

      invalidateDuringValidation = true;
      writeProducer(triggerSource, 1);

      expect(validateDependencies(watcher, watcher.firstIn)).toBe(false);
      expect(watcher.state & Unknown).toBe(Unknown);
      expect(watcher.state & Visited).toBe(Visited);
      expect(watcher.state & Computing).toBe(0);
      expect(watcher.tailIn).toBe(committedTail);
    },
  );

  it("preserves failure evidence and scheduler ownership", () => {
    let watcher!: ReturnType<typeof createWatcher>;
    resetRuntime({
      onNodeInvalidated(node) {
        if (node === watcher && (node.state & Computing) !== 0) {
          claimWatcherSchedule(watcher);
        }
      },
    });

    const firstSource = createProducer(0);
    const reentrantSource = createProducer(0);
    const reentrantTrigger = createProducer(0);
    const throwingSource = createProducer(0);
    let invalidateDuringValidation = false;
    let throwDuringValidation = false;

    const first = createConsumer(() => readProducer(firstSource));
    const reentrant = createConsumer(() => {
      const value = readProducer(reentrantTrigger);
      if (invalidateDuringValidation) {
        invalidateDuringValidation = false;
        writeProducer(reentrantSource, 1);
      }
      return value;
    });
    const throwing = createConsumer(() => {
      const value = readProducer(throwingSource);
      if (throwDuringValidation) throw new Error("validation failed");
      return value;
    });
    watcher = createWatcher(() => {
      readConsumer(first);
      readConsumer(reentrant);
      readConsumer(throwing);
      readProducer(reentrantSource);
    });

    runWatcher(watcher);
    const committedTail = watcher.tailIn;

    invalidateDuringValidation = true;
    throwDuringValidation = true;
    writeProducer(firstSource, 1);
    writeProducer(reentrantTrigger, 1);
    writeProducer(throwingSource, 1);

    expect(() => validateDependencies(watcher, watcher.firstIn)).toThrow(
      "validation failed",
    );
    expect(watcher.state & Both).toBe(Both);
    expect(watcher.state & Visited).toBe(Visited);
    expect(watcher.state & Scheduled).toBe(Scheduled);
    expect(watcher.state & Computing).toBe(0);
    expect(watcher.tailIn).toBe(committedTail);

    releaseWatcherSchedule(watcher);
  });
});
