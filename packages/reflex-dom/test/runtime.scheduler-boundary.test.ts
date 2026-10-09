import { describe, expect, it } from "vitest";
import {
  configureRuntimeContext,
  createRuntimeContext,
  getActiveRuntimeContext,
  runWithRuntimeContext,
} from "@volynets/reflex-runtime/internal";
import {
  createProducer,
  createWatcher,
  readProducer,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime";
import {
  createRuntimeSchedulerBinding,
  EffectSchedulerMode,
  type EffectStrategy,
} from "@volynets/reflex-scheduler";
import { createRendererRuntime } from "../src/runtime/options";
import { createDOMSchedulerCoordinator } from "../src/runtime/scheduler/coordinator";
import type { HostCarrier, HostToken } from "../src/runtime/scheduler/host-carrier";

function createControlledBoundary() {
  const execution = createRuntimeContext();
  const scheduler = createRuntimeSchedulerBinding(EffectSchedulerMode.Flush, execution);
  const requests: Array<{ token: HostToken; resume: (token: HostToken) => void }> = [];
  let nextToken = 0;
  const carrier: HostCarrier = {
    postMicrotask(resume) {
      const token = ++nextToken;
      requests.push({ token, resume });
      return token;
    },
  };
  const run = <T>(fn: () => T): T => runWithRuntimeContext(execution, fn);
  const coordinator = createDOMSchedulerCoordinator(
    scheduler,
    undefined,
    carrier,
    run,
  );
  configureRuntimeContext(execution, {
    hooks: {
      onNodeInvalidated: coordinator.onNodeInvalidated,
      onRuntimeIdle: coordinator.onRuntimeIdle,
    },
  });
  const source = run(() => createProducer(0));
  const observed: number[] = [];
  const watcher = run(() =>
    createWatcher(() => observed.push(readProducer(source))),
  );
  run(() => runWatcher(watcher));
  return { coordinator, requests, run, source, observed };
}

describe("runtime / scheduler / DOM boundary", () => {
  it("posts only for pending work and validates every host resume token", () => {
    const { coordinator, requests, run, source, observed } = createControlledBoundary();

    coordinator.batch(() => {});
    expect(requests).toHaveLength(0);

    coordinator.batch(() => writeProducer(source, 1));
    coordinator.batch(() => writeProducer(source, 2));
    expect(requests).toHaveLength(1);
    expect(observed).toEqual([0]);

    requests[0]!.resume(requests[0]!.token);
    expect(observed).toEqual([0, 2]);

    run(() => writeProducer(source, 3));
    expect(requests).toHaveLength(2);
    requests[0]!.resume(requests[0]!.token);
    expect(observed).toEqual([0, 2]);
    requests[1]!.resume(requests[1]!.token);
    expect(observed).toEqual([0, 2, 3]);
  });

  it("recovers from a failed host drain with a new request", () => {
    const execution = createRuntimeContext();
    const scheduler = createRuntimeSchedulerBinding(EffectSchedulerMode.Flush, execution);
    const requests: Array<() => void> = [];
    let nextToken = 0;
    const carrier: HostCarrier = {
      postMicrotask(resume) {
        const token = ++nextToken;
        requests.push(() => resume(token));
        return token;
      },
    };
    const run = <T>(fn: () => T): T => runWithRuntimeContext(execution, fn);
    const coordinator = createDOMSchedulerCoordinator(scheduler, undefined, carrier, run);
    configureRuntimeContext(execution, {
      hooks: {
        onNodeInvalidated: coordinator.onNodeInvalidated,
        onRuntimeIdle: coordinator.onRuntimeIdle,
      },
    });
    const source = run(() => createProducer(0));
    const error = new Error("failed watcher");
    const observed: number[] = [];
    const watcher = run(() =>
      createWatcher(() => {
        const value = readProducer(source);
        observed.push(value);
        if (value === 1) throw error;
      }),
    );
    run(() => runWatcher(watcher));

    run(() => writeProducer(source, 1));
    expect(() => requests[0]!()).toThrow(error);
    run(() => writeProducer(source, 2));
    expect(requests).toHaveLength(2);
    requests[1]!();
    expect(observed).toEqual([0, 1, 2]);
  });

  it("does not post a second continuation for reentrant work drained now", () => {
    const { coordinator, requests, run, source } = createControlledBoundary();
    const downstream = run(() => createProducer(0));
    const observed: number[] = [];
    const producerWatcher = run(() =>
      createWatcher(() => {
        const value = readProducer(source);
        if (value > 0) writeProducer(downstream, value + 1);
      }),
    );
    const downstreamWatcher = run(() =>
      createWatcher(() => observed.push(readProducer(downstream))),
    );
    run(() => {
      runWatcher(producerWatcher);
      runWatcher(downstreamWatcher);
    });

    coordinator.batch(() => writeProducer(source, 1));
    expect(requests).toHaveLength(1);
    requests[0]!.resume(requests[0]!.token);
    expect(observed).toEqual([0, 2]);
    expect(requests).toHaveLength(1);
  });

  it("keeps the draining state through a nested explicit flush", () => {
    const { coordinator, requests, run, source } = createControlledBoundary();
    const downstream = run(() => createProducer(0));
    const observed: number[] = [];
    const producerWatcher = run(() =>
      createWatcher(() => {
        const value = readProducer(source);
        if (value === 0) return;
        coordinator.flush();
        writeProducer(downstream, value + 1);
      }),
    );
    const downstreamWatcher = run(() =>
      createWatcher(() => observed.push(readProducer(downstream))),
    );
    run(() => {
      runWatcher(producerWatcher);
      runWatcher(downstreamWatcher);
    });

    coordinator.batch(() => writeProducer(source, 1));
    requests[0]!.resume(requests[0]!.token);
    expect(observed).toEqual([0, 2]);
    expect(requests).toHaveLength(1);
  });

  it.each(["eager", "sab", "flush"] as const)(
    "isolates nested renderer contexts with %s delivery",
    async (strategy: EffectStrategy) => {
      const left = createRendererRuntime({ effectStrategy: strategy });
      const right = createRendererRuntime({ effectStrategy: strategy });
      const leftSource = left.run(() => createProducer(0));
      const rightSource = right.run(() => createProducer(0));
      const leftValues: number[] = [];
      const rightValues: number[] = [];
      const leftWatcher = left.run(() =>
        createWatcher(() => leftValues.push(readProducer(leftSource))),
      );
      const rightWatcher = right.run(() =>
        createWatcher(() => rightValues.push(readProducer(rightSource))),
      );
      left.run(() => runWatcher(leftWatcher));
      right.run(() => runWatcher(rightWatcher));

      left.batch(() => {
        writeProducer(leftSource, 1);
        right.batch(() => writeProducer(rightSource, 1));
        writeProducer(leftSource, 2);
      });
      if (strategy === "flush") await Promise.resolve();

      expect(leftValues).toEqual([0, 2]);
      expect(rightValues).toEqual([0, 1]);
      left.run(() => writeProducer(leftSource, 3));
      if (strategy === "sab") left.flush();
      if (strategy === "flush") await Promise.resolve();
      expect(leftValues).toEqual([0, 2, 3]);
      expect(rightValues).toEqual([0, 1]);
    },
  );

  it("restores the outer runtime after a nested scheduler error", () => {
    const left = createRendererRuntime();
    const right = createRendererRuntime();
    const leftSource = left.run(() => createProducer(0));
    const rightSource = right.run(() => createProducer(0));
    const error = new Error("right watcher failed");
    const leftValues: number[] = [];
    const rightValues: number[] = [];
    const leftWatcher = left.run(() =>
      createWatcher(() => leftValues.push(readProducer(leftSource))),
    );
    const failingWatcher = right.run(() =>
      createWatcher(() => {
        if (readProducer(rightSource) > 0) throw error;
      }),
    );
    const survivingWatcher = right.run(() =>
      createWatcher(() => rightValues.push(readProducer(rightSource))),
    );
    left.run(() => runWatcher(leftWatcher));
    right.run(() => {
      runWatcher(failingWatcher);
      runWatcher(survivingWatcher);
    });

    left.batch(() => {
      expect(() => right.batch(() => writeProducer(rightSource, 1))).toThrow(error);
      expect(getActiveRuntimeContext()).toBe(left.execution);
      writeProducer(leftSource, 1);
    });

    expect(leftValues).toEqual([0, 1]);
    expect(rightValues).toEqual([0, 1]);
  });
});
