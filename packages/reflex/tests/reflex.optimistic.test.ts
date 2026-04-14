import { describe, expect, it, vi } from "vitest";
import { computed, effect, signal } from "../src";
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

  it("restores outer optimistic layers after nested transitions settle", async () => {
    createRuntime();
    const [state, setState] = optimistic(0);

    await transition(async () => {
      setState(1);
      expect(state()).toBe(1);

      transition(() => {
        setState(2);
        expect(state()).toBe(2);
      });

      expect(state()).toBe(1);
      await Promise.resolve();
      expect(state()).toBe(1);
    });

    expect(state()).toBe(0);
  });
});
