import { describe, expect, it, vi } from "vitest";
import { ReactiveNodeState } from "../../@reflex/runtime/src/reactivity/shape/ReactiveMeta";
import {
  effect,
  effectScheduled,
  effectUnscheduled,
  withEffectCleanupRegistrar,
} from "../src/api/effect";
import { createWatcherNode } from "../src/infra/factory";
import { createRuntime, memo, signal } from "./reflex.test_utils";

describe("Reactive system - effects", () => {
  it("runs once immediately and reruns after flush", () => {
    const rt = createRuntime();
    const [source, setSource] = signal(1);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source();
      return cleanup;
    });

    const scope = effect(spy);

    expect(spy).toHaveBeenCalledTimes(1);

    setSource(2);
    expect(spy).toHaveBeenCalledTimes(1);

    rt.flush();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(2);

    scope();
    expect(cleanup).toHaveBeenCalledTimes(2);

    setSource(3);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("flushes eagerly when runtime uses eager strategy", () => {
    createRuntime({ effectStrategy: "eager" });
    const [source, setSource] = signal(1);
    const spy = vi.fn(() => {
      source();
    });

    effect(spy);
    expect(spy).toHaveBeenCalledTimes(1);

    setSource(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("can flush after batch exits in sab mode", () => {
    const rt = createRuntime({
      effectStrategy: "sab",
    });
    const [source, setSource] = signal(1);
    const spy = vi.fn(() => {
      source();
    });

    effect(spy);
    expect(spy).toHaveBeenCalledTimes(1);

    rt.batch(() => {
      setSource(2);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("reruns after transitive memo invalidation on flush", () => {
    const rt = createRuntime();
    const [source, setSource] = signal(1);
    const inner = memo(() => source() + 1);
    const outer = memo(() => inner() + 1);
    const spy = vi.fn(() => {
      outer();
    });

    effect(spy);
    expect(spy).toHaveBeenCalledTimes(1);

    setSource(2);
    expect(spy).toHaveBeenCalledTimes(1);

    rt.flush();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("propagates through long linear chains without dropping updates", () => {
    const rt = createRuntime();
    const [source, setSource] = signal(73);
    const tapValues = new Map<number, number>();

    let current = source;
    for (let depth = 0; depth < 192; ++depth) {
      const prev = current;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      current = memo(() => prev() + ((depth & 3) + 1)) as any;

      if (depth === 47 || depth === 95 || depth === 143 || depth === 191) {
        const tap = current;
        effect(() => {
          tapValues.set(depth, tap());
        });
      }
    }

    const expectedPrefixSum = (depthInclusive: number): number => {
      let total = 0;
      for (let i = 0; i <= depthInclusive; ++i) {
        total += (i & 3) + 1;
      }
      return total;
    };

    rt.flush();

    setSource(75);
    rt.flush();

    for (const depth of [47, 95, 143, 191]) {
      expect(tapValues.get(depth)).toBe(75 + expectedPrefixSum(depth));
    }
  });

  it("callable scope disposes the effect", () => {
    const rt = createRuntime();
    const [source, setSource] = signal(1);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source();
      return cleanup;
    });

    const scope = effect(spy);
    scope();

    expect(cleanup).toHaveBeenCalledTimes(1);

    setSource(2);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("can scope nested effects to an outer effect cleanup", () => {
    const rt = createRuntime();
    const [branch, setBranch] = signal("a");
    const [value, setValue] = signal(1);
    const log: string[] = [];

    const stop = effect(() => {
      const branchValue = branch();
      const nestedCleanups: Destructor[] = [];

      log.push(`outer:run:${branchValue}`);

      withEffectCleanupRegistrar((cleanup) => {
        nestedCleanups.push(cleanup);
      }, () => {
        effect(() => {
          const innerValue = value();
          log.push(`inner:run:${branchValue}:${innerValue}`);

          return () => {
            log.push(`inner:cleanup:${branchValue}:${innerValue}`);
          };
        });
      });

      return () => {
        for (let index = nestedCleanups.length - 1; index >= 0; --index) {
          nestedCleanups[index]!();
        }

        log.push(`outer:cleanup:${branchValue}`);
      };
    });

    expect(log).toEqual(["outer:run:a", "inner:run:a:1"]);

    setValue(2);
    rt.flush();

    expect(log).toEqual([
      "outer:run:a",
      "inner:run:a:1",
      "inner:cleanup:a:1",
      "inner:run:a:2",
    ]);

    setBranch("b");
    rt.flush();

    expect(log).toEqual([
      "outer:run:a",
      "inner:run:a:1",
      "inner:cleanup:a:1",
      "inner:run:a:2",
      "inner:cleanup:a:2",
      "outer:cleanup:a",
      "outer:run:b",
      "inner:run:b:2",
    ]);

    setValue(3);
    rt.flush();

    expect(log).toEqual([
      "outer:run:a",
      "inner:run:a:1",
      "inner:cleanup:a:1",
      "inner:run:a:2",
      "inner:cleanup:a:2",
      "outer:cleanup:a",
      "outer:run:b",
      "inner:run:b:2",
      "inner:cleanup:b:2",
      "inner:run:b:3",
    ]);

    stop();

    expect(log).toEqual([
      "outer:run:a",
      "inner:run:a:1",
      "inner:cleanup:a:1",
      "inner:run:a:2",
      "inner:cleanup:a:2",
      "outer:cleanup:a",
      "outer:run:b",
      "inner:run:b:2",
      "inner:cleanup:b:2",
      "inner:run:b:3",
      "inner:cleanup:b:3",
      "outer:cleanup:b",
    ]);
  });

  it("disposes scheduled nested effects when the outer effect stops", () => {
    const rt = createRuntime();
    const [value, setValue] = signal(1);
    const innerSpy = vi.fn(() => {
      value();
    });
    const innerCleanup = vi.fn();

    const stop = effect(() => {
      const nestedCleanups: Destructor[] = [];

      withEffectCleanupRegistrar((cleanup) => {
        nestedCleanups.push(cleanup);
      }, () => {
        effect(() => {
          innerSpy();
          value();
          return innerCleanup;
        });
      });

      return () => {
        for (let index = nestedCleanups.length - 1; index >= 0; --index) {
          nestedCleanups[index]!();
        }
      };
    });

    expect(innerSpy).toHaveBeenCalledTimes(1);

    setValue(2);
    stop();
    rt.flush();

    expect(innerSpy).toHaveBeenCalledTimes(1);
    expect(innerCleanup).toHaveBeenCalledTimes(1);
  });

  it("notifies custom invalidation hooks before flush", () => {
    let invalidations = 0;
    const rt = createRuntime({
      effectStrategy: "flush",
      hooks: {
        onEffectInvalidated() {
          invalidations += 1;
        },
      },
    });
    const [source, setSource] = signal(1);

    effect(() => {
      source();
    });

    setSource(2);
    expect(invalidations).toBe(1);

    rt.flush();
    expect(invalidations).toBe(1);
  });

  it("toggles the scheduled flag helpers", () => {
    const node = createWatcherNode(() => {});

    effectScheduled(node);
    expect(node.state & ReactiveNodeState.Scheduled).toBeTruthy();

    effectUnscheduled(node);
    expect(node.state & ReactiveNodeState.Scheduled).toBeFalsy();
  });
});
