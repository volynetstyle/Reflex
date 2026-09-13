import { describe, expect, it } from "vitest";
import {
  effect as alienEffect,
  effectScope as alienEffectScope,
  getActiveSub,
  signal as alienSignal,
} from "alien-signals";
import {
  createRuntime,
  effect as reflexEffect,
  signal as reflexSignal,
} from "@volynets/reflex";

interface LifecycleSignal<T> {
  read(): T;
  write(value: T): void;
}

interface LifecycleApi {
  signal<T>(initial: T): LifecycleSignal<T>;
  effect(fn: () => void): () => void;
  flush(): void;
  effectScope?: (fn: () => void) => () => void;
}

function alienApi(): LifecycleApi {
  return {
    signal<T>(initial: T) {
      const value = alienSignal(initial);
      return { read: value, write: value };
    },
    effect: alienEffect,
    effectScope: alienEffectScope,
    flush() {},
  };
}

function reflexApi(): LifecycleApi {
  const runtime = createRuntime({ effectStrategy: "eager" });
  return {
    signal<T>(initial: T) {
      const value = reflexSignal(initial);
      return {
        read: value,
        write: (next: T) => void (value.set as (input: T) => unknown)(next),
      };
    },
    effect: reflexEffect,
    flush: runtime.flush,
  };
}

function disposedConsumerCannotTrack(api: LifecycleApi): void {
  const trigger = api.signal(0);
  const lateDependency = api.signal(0);
  let runs = 0;
  let stop: (() => void) | undefined;
  stop = api.effect(() => {
    runs++;
    trigger.read();
    if (runs === 2) {
      stop!();
      lateDependency.read();
    }
  });
  trigger.write(1);
  api.flush();
  expect(runs).toBe(2);
  lateDependency.write(1);
  api.flush();
  expect(runs).toBe(2);
}

function alienDisposedConsumerCannotTrack(): void {
  const trigger = alienSignal(0);
  const lateDependency = alienSignal(0);
  let stop: (() => void) | undefined;
  let disposedConsumer: { deps?: unknown; flags: number } | undefined;
  let runs = 0;
  stop = alienEffect(() => {
    runs++;
    trigger();
    if (runs === 2) {
      disposedConsumer = getActiveSub() as typeof disposedConsumer;
      stop!();
      lateDependency();
    }
  });
  trigger(1);
  expect(runs).toBe(2);
  expect(disposedConsumer?.flags).toBe(0);
  // A disposed consumer must remain detached after all subsequent reads in
  // the callback. Alien 3.2.1 recreates this dependency link.
  expect(disposedConsumer?.deps).toBeUndefined();
}

function failedWatcherCreationIsTransactional(api: LifecycleApi): void {
  const source = api.signal(0);
  let runs = 0;
  expect(() => {
    api.effect(() => {
      runs++;
      source.read();
      throw new Error("initial watcher failure");
    });
  }).toThrow("initial watcher failure");
  expect(runs).toBe(1);
  try {
    source.write(1);
    api.flush();
  } catch {
    // A rerun throwing again is itself the lifecycle failure under test.
  }
  expect(runs).toBe(1);
}

function failedScopeCreationDisposesChildren(api: LifecycleApi): void {
  if (api.effectScope === undefined) throw new Error("effectScope unsupported");
  const source = api.signal(0);
  let childRuns = 0;
  expect(() => {
    api.effectScope!(() => {
      api.effect(() => {
        childRuns++;
        source.read();
      });
      throw new Error("scope creation failure");
    });
  }).toThrow("scope creation failure");
  expect(childRuns).toBe(1);
  source.write(1);
  api.flush();
  expect(childRuns).toBe(1);
}

describe("Alien Signals 3.2.1 lifecycle regression contracts", () => {
  it.fails("disposed consumer cannot track", alienDisposedConsumerCannotTrack);
  it.fails("failed watcher creation is transactional", () =>
    failedWatcherCreationIsTransactional(alienApi()),
  );
  it.fails("failed scope creation disposes children", () =>
    failedScopeCreationDisposesChildren(alienApi()),
  );
});

describe("Reflex lifecycle contracts", () => {
  it("disposed consumer cannot track", () => disposedConsumerCannotTrack(reflexApi()));
  it("failed watcher creation is transactional", () =>
    failedWatcherCreationIsTransactional(reflexApi()),
  );
  it.skip("failed scope creation disposes children (no public effectScope contract)", () => {});
});
