import { beforeEach, describe, expect, it } from "vitest";
import {
  RuntimePhase,
  readConsumer,
  readProducer,
  readRuntimePhase,
  runWatcher,
  writeProducer,
} from "../../../src";
import {
  createConsumer,
  createProducer,
  createWatcher,
  resetRuntime,
} from "../../runtime.test_utils";

describe("Reactive runtime - scheduler policy validation (dev)", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("rejects synchronous watcher execution from a runtime hook", () => {
    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
    });

    runWatcher(watcher);

    resetRuntime({
      sinkInvalidatedDispatcher(node) {
        runWatcher(node as typeof watcher);
      },
    });

    expect(() => writeProducer(source, 2)).toThrow(
      /REFLEX_SCHEDULER_REENTRANT_FLUSH/,
    );
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
  });

  it("rejects reactive reads from a runtime hook", () => {
    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
    });

    runWatcher(watcher);

    resetRuntime({
      sinkInvalidatedDispatcher() {
        readProducer(source);
      },
    });

    expect(() => writeProducer(source, 2)).toThrow(
      /REFLEX_SCHEDULER_REACTIVE_READ_IN_HOOK/,
    );
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
  });

  it("rejects nested pull walks", () => {
    const source = createProducer(1);
    const otherSource = createProducer(1);
    const otherInner = createConsumer(() => readProducer(otherSource));
    const otherOuter = createConsumer(() => readConsumer(otherInner));
    const inner = createConsumer(() => readProducer(source));
    const outer = createConsumer(() => readConsumer(inner));

    expect(readConsumer(outer)).toBe(1);
    expect(readConsumer(otherOuter)).toBe(1);
    writeProducer(source, 2);
    writeProducer(otherSource, 2);

    const original = inner.compute!;
    inner.compute = () => {
      readConsumer(otherOuter);
      return original();
    };

    expect(() => readConsumer(outer)).toThrow(/REFLEX_NESTED_PULL/);
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
  });

  it("rejects nested propagation from an invalidation hook", () => {
    const outerSource = createProducer(1);
    const innerSource = createProducer(1);
    let outerWatcher!: ReturnType<typeof createWatcher>;

    outerWatcher = createWatcher(() => {
      readProducer(outerSource);
    });
    const innerWatcher = createWatcher(() => {
      readProducer(innerSource);
    });

    runWatcher(outerWatcher);
    runWatcher(innerWatcher);

    resetRuntime({
      sinkInvalidatedDispatcher(node) {
        if (node === outerWatcher) {
          writeProducer(innerSource, 2);
        }
      },
    });

    expect(() => writeProducer(outerSource, 2)).toThrow(
      /REFLEX_NESTED_PROPAGATION/,
    );
    expect(readRuntimePhase().phase).toBe(RuntimePhase.Idle);
    expect(readRuntimePhase().depth).toBe(0);
  });
});
