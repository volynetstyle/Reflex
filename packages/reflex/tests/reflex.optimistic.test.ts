import { describe, expect, it, vi } from "vitest";
import { computed, effect, signal, withEffectCleanupRegistrar } from "../src";
import { optimistic, transition } from "../src/unstable";
import { createRuntime } from "./reflex.test_utils";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

describe("Reactive system - unstable optimistic invariants", () => {
  it("uses the latest optimistic value for updater functions and reverts after the microtask", async () => {
    createRuntime();
    const [state, setState] = optimistic(10);

    setState((prev) => {
      expect(prev).toBe(10);
      return 20;
    });

    setState((prev) => {
      expect(prev).toBe(20);
      return prev + 5;
    });

    expect(state()).toBe(25);

    await Promise.resolve();

    expect(state()).toBe(10);
  });

  it("coalesces same-turn optimistic writes for downstream effects", async () => {
    const rt = createRuntime();
    const [state, setState] = optimistic(1);
    const seen: number[] = [];

    effect(() => {
      seen.push(state());
    });

    setState(2);
    setState(3);
    setState((prev) => prev + 10);

    rt.flush();

    expect(seen).toEqual([1, 13]);

    await Promise.resolve();
    rt.flush();

    expect(seen).toEqual([1, 13, 1]);
  });

  it("does not invalidate downstream effects when the optimistic value matches the fallback", async () => {
    const rt = createRuntime();
    const [state, setState] = optimistic(5);
    const spy = vi.fn();

    effect(() => {
      spy(state());
    });

    setState(5);
    rt.flush();
    await Promise.resolve();
    rt.flush();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(5);
  });

  it("keeps a transition-owned optimistic layer visible until the async transition settles", async () => {
    const rt = createRuntime();
    const [state, setState] = optimistic(0);
    const task = deferred<void>();
    const seen: number[] = [];

    effect(() => {
      seen.push(state());
    });

    const pending = transition(async () => {
      setState(10);
      rt.flush();

      expect(state()).toBe(10);
      expect(seen).toEqual([0, 10]);

      await task.promise;

      expect(state()).toBe(10);
    });

    expect(state()).toBe(10);

    task.resolve();
    await pending;
    rt.flush();

    expect(state()).toBe(0);
    expect(seen).toEqual([0, 10, 0]);
  });

  it("restores the latest derived fallback once the optimistic layer clears", async () => {
    createRuntime();
    const [source, setSource] = signal(1);
    const [state, setState] = optimistic<number>(() => source() + 1);
    const task = deferred<void>();

    const pending = transition(async () => {
      setState(99);
      setSource(4);

      expect(state()).toBe(99);

      await task.promise;

      expect(state()).toBe(99);
    });

    task.resolve();
    await pending;

    expect(state()).toBe(5);
  });

  it("propagates optimistic overrides through computed chains and back to the fallback", async () => {
    const rt = createRuntime();
    const [state, setState] = optimistic(1);
    const plusOne = computed(() => state() + 1);
    const doubled = computed(() => plusOne() * 2);
    const seen: number[] = [];

    effect(() => {
      seen.push(doubled());
    });

    setState(10);
    rt.flush();

    expect(doubled()).toBe(22);
    expect(seen).toEqual([4, 22]);

    await Promise.resolve();
    rt.flush();

    expect(doubled()).toBe(4);
    expect(seen).toEqual([4, 22, 4]);
  });

  it("keeps the last override for repeated writes from one transition owner and clears it on finalize", async () => {
    const rt = createRuntime();
    const [state, setState] = optimistic(1);
    const task = deferred<void>();
    const seen: number[] = [];

    effect(() => {
      seen.push(state());
    });

    const pending = transition(async () => {
      setState(2);
      setState(3);
      rt.flush();

      expect(state()).toBe(3);
      expect(seen).toEqual([1, 3]);

      await task.promise;

      expect(state()).toBe(3);
    });

    expect(state()).toBe(3);

    task.resolve();
    await pending;
    rt.flush();

    expect(state()).toBe(1);
    expect(seen).toEqual([1, 3, 1]);
  });

  it("keeps showing the override while the base changes underneath it", async () => {
    createRuntime();
    const [base, setBase] = signal(1);
    const [state, setState] = optimistic(() => base());
    const task = deferred<void>();

    const pending = transition(async () => {
      setState(5);
      setBase(2);

      expect(state()).toBe(5);

      await task.promise;
    });

    expect(state()).toBe(5);

    task.resolve();
    await pending;

    expect(state()).toBe(2);
  });

  it("does not emit an extra notification when the base catches up to the active override", async () => {
    const rt = createRuntime();
    const [base, setBase] = signal(1);
    const [state, setState] = optimistic(() => base());
    const task = deferred<void>();
    const seen: number[] = [];

    effect(() => {
      seen.push(state());
    });

    const pending = transition(async () => {
      setState(5);
      rt.flush();

      expect(seen).toEqual([1, 5]);

      setBase(5);
      rt.flush();

      expect(state()).toBe(5);
      expect(seen).toEqual([1, 5]);

      await task.promise;
    });

    task.resolve();
    await pending;
    rt.flush();

    expect(state()).toBe(5);
    expect(seen).toEqual([1, 5]);
  });

  it("lets a newer owner take over without being cleared by an older finalize", async () => {
    const rt = createRuntime();
    const [state, setState] = optimistic(0);
    const taskA = deferred<void>();
    const taskB = deferred<void>();
    const seen: number[] = [];

    effect(() => {
      seen.push(state());
    });

    const pendingA = transition(async () => {
      setState(10);
      rt.flush();
      await taskA.promise;
    });

    const pendingB = transition(async () => {
      setState(20);
      rt.flush();
      await taskB.promise;
    });

    expect(state()).toBe(20);
    expect(seen).toEqual([0, 10, 20]);

    taskA.resolve();
    await pendingA;
    rt.flush();

    expect(state()).toBe(20);
    expect(seen).toEqual([0, 10, 20]);

    taskB.resolve();
    await pendingB;
    rt.flush();

    expect(state()).toBe(0);
    expect(seen).toEqual([0, 10, 20, 0]);
  });

  it("does not let an older microtask owner clear a newer transition override", async () => {
    const rt = createRuntime();
    const [state, setState] = optimistic(0);
    const task = deferred<void>();

    setState(10);
    expect(state()).toBe(10);

    const pending = transition(async () => {
      setState(20);
      rt.flush();

      expect(state()).toBe(20);

      await task.promise;
    });

    await Promise.resolve();
    rt.flush();

    expect(state()).toBe(20);

    task.resolve();
    await pending;
    rt.flush();

    expect(state()).toBe(0);
  });

  it("clears the active override on dispose and keeps later writes as no-ops", () => {
    createRuntime();
    const [base, setBase] = signal(1);
    let state!: () => number;
    let setState!: (value: number | ((prev: number) => number)) => number;
    const cleanups: Array<() => void> = [];

    withEffectCleanupRegistrar((cleanup) => {
      cleanups.push(cleanup);
    }, () => {
      [state, setState] = optimistic(() => base());
    });

    setState(5);
    expect(state()).toBe(5);

    cleanups[0]?.();

    expect(state()).toBe(1);

    setBase(2);
    expect(state()).toBe(2);

    expect(setState(9)).toBe(9);
    expect(state()).toBe(2);
  });
});
