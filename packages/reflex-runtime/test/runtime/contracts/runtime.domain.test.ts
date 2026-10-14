import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createExecutionDomain,
  ExecutionDomainClosedError,
  ExecutionDomainState,
  getActiveExecutionDomain,
  getActiveRuntimeContext,
  getExecutionDomain,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
  type ExecutionDomainScheduler,
  type ReactiveNode,
} from "../../runtime.test_utils";
import {
  createConsumer,
  createProducer,
  createWatcher,
  expectSources,
  resetRuntime,
} from "../../runtime.test_utils";

function createQueueScheduler() {
  const queue: ReactiveNode[] = [];
  const log: string[] = [];
  const scheduler: ExecutionDomainScheduler = {
    onNodeInvalidated: (node) => void queue.push(node),
    onRuntimeIdle: () => void log.push("idle"),
    enterBatch: () => void log.push("enter"),
    leaveBatch: () => void log.push("leave"),
    flush() {
      while (queue.length !== 0) runWatcher(queue.shift()!);
    },
    hasPending: () => queue.length !== 0,
    release: () => void (queue.length = 0),
  };
  return { scheduler, queue, log };
}

describe("Reactive runtime - execution domains", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("runs inside its own context and restores the caller", () => {
    const outer = getActiveRuntimeContext();
    const domain = createExecutionDomain();

    domain.run(() => {
      expect(getActiveRuntimeContext()).toBe(domain.context);
      expect(getActiveExecutionDomain()).toBe(domain);
      expect(domain.depth).toBe(1);
    });

    expect(getActiveRuntimeContext()).toBe(outer);
    expect(getExecutionDomain(domain.context)).toBe(domain);
    expect(domain.depth).toBe(0);
  });

  it("does not reload registers on a nested entry into the same domain", () => {
    const domain = createExecutionDomain();
    const first = createProducer(1);
    const second = createProducer(2);
    const computed = createConsumer(
      () => readProducer(first) + domain.run(() => readProducer(second)),
    );

    domain.run(() => {
      expect(readConsumer(computed)).toBe(3);
      expectSources(computed, [first, second]);
    });
  });

  it("routes each invalidation to its own domain's scheduler (S1)", () => {
    const a = createQueueScheduler();
    const b = createQueueScheduler();
    const domainA = createExecutionDomain({ scheduler: a.scheduler });
    const domainB = createExecutionDomain({ scheduler: b.scheduler });
    const sourceA = createProducer(0);
    const sourceB = createProducer(0);
    const seen: string[] = [];
    const watcherA = createWatcher(() => {
      seen.push(`a${readProducer(sourceA)}`);
      domainB.run(() => writeProducer(sourceB, readProducer(sourceA)));
    });
    const watcherB = createWatcher(
      () => void seen.push(`b${readProducer(sourceB)}`),
    );

    domainA.run(() => runWatcher(watcherA));
    domainB.run(() => runWatcher(watcherB));

    domainA.run(() => writeProducer(sourceA, 1));
    expect(a.queue).toEqual([watcherA]);
    expect(b.queue).toEqual([]);

    domainA.flush();
    expect(b.queue).toEqual([watcherB]);
    expect(a.queue).toEqual([]);

    domainB.flush();
    expect(seen).toEqual(["a0", "b0", "a1", "b1"]);
  });

  it("composes the reactive batch with scheduler batch boundaries", () => {
    const { scheduler, log } = createQueueScheduler();
    const external = vi.fn();
    const domain = createExecutionDomain({
      scheduler,
      hooks: { onRuntimeIdle: external },
    });
    const source = createProducer(0);
    domain.run(() =>
      runWatcher(createWatcher(() => void readProducer(source))),
    );

    domain.batch(() => {
      writeProducer(source, 1);
      writeProducer(source, 2);
      expect(log).toEqual(["enter"]);
    });

    expect(log).toEqual(["enter", "leave", "idle"]);
    expect(external).toHaveBeenCalledTimes(1);
  });

  it("aggregates a callback error with a scheduler exit error", () => {
    const domain = createExecutionDomain({
      scheduler: {
        leaveBatch() {
          throw new Error("leave");
        },
      },
    });

    expect(() =>
      domain.batch(() => {
        throw new Error("callback");
      }),
    ).toThrow(AggregateError);
    expect(domain.depth).toBe(0);
  });

  it("closes logically at once and physically at the safe point", () => {
    const { scheduler, queue } = createQueueScheduler();
    const domain = createExecutionDomain({ scheduler });
    const signal = domain.signal;
    const order: string[] = [];

    domain.run(() => {
      queue.push(createWatcher(() => {}));
      domain.teardown(() => order.push("teardown"));
      domain.close();

      expect(domain.state).toBe(ExecutionDomainState.Closing);
      expect(signal.aborted).toBe(true);
      expect(queue).toEqual([]);
      expect(order).toEqual([]);
      // The outer continuation keeps running, including nested entries.
      domain.run(() => order.push("continuation"));
    });

    expect(order).toEqual(["continuation", "teardown"]);
    expect(domain.state).toBe(ExecutionDomainState.Closed);
    expect(domain.context.nodeInvalidatedHook).toBeUndefined();
    expect(() => domain.run(() => 0)).toThrow(ExecutionDomainClosedError);
    expect(() => domain.flush()).not.toThrow();
    expect(domain.hasPending()).toBe(false);
  });

  it("closes immediately outside managed execution", () => {
    const domain = createExecutionDomain();
    domain.close();
    domain.close();

    expect(domain.state).toBe(ExecutionDomainState.Closed);
    expect(domain.signal.aborted).toBe(true);
  });

  it("runs teardown now at a safe point and defers it inside execution", () => {
    const domain = createExecutionDomain();
    const order: string[] = [];

    domain.teardown(() => order.push("immediate"));
    domain.run(() => {
      domain.teardown(() => {
        order.push("deferred");
        domain.teardown(() => order.push("during drain"));
      });
      order.push("body");
    });

    expect(order).toEqual(["immediate", "body", "deferred", "during drain"]);
  });

  it("reports teardown errors and keeps draining", () => {
    const onTeardownError = vi.fn();
    const domain = createExecutionDomain({ onTeardownError });
    const order: string[] = [];

    domain.run(() => {
      domain.teardown(() => {
        throw new Error("first");
      });
      domain.teardown(() => order.push("second"));
    });

    expect(onTeardownError).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["second"]);
  });

  it("drains teardown at the outer exit when the body throws", () => {
    const domain = createExecutionDomain();
    const teardown = vi.fn();

    expect(() =>
      domain.run(() => {
        domain.teardown(teardown);
        throw new Error("body");
      }),
    ).toThrow("body");

    expect(teardown).toHaveBeenCalledTimes(1);
    expect(domain.depth).toBe(0);
  });
});
