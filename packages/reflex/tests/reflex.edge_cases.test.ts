import { describe, expect, it, vi } from "vitest";
import { computed, createRuntime, effect, signal } from "./reflex.test_utils";

describe("Reactive system - edge cases", () => {
  it("keeps cleanup reads untracked so they do not create ghost reruns", () => {
    const rt = createRuntime();
    const source = signal(1);
    const cleanupSource = signal(10);
    const cleanupDerivedSpy = vi.fn(() => cleanupSource() * 2);
    const cleanupDerived = computed(cleanupDerivedSpy);
    const log: string[] = [];

    effect(() => {
      const value = source();
      log.push(`run:${value}`);

      return () => {
        log.push(`cleanup:${cleanupDerived()}`);
      };
    });

    source.set(2);
    rt.flush();

    expect(log).toEqual(["run:1", "cleanup:20", "run:2"]);
    expect(cleanupDerivedSpy).toHaveBeenCalledTimes(1);

    cleanupSource.set(11);
    rt.flush();

    expect(log).toEqual(["run:1", "cleanup:20", "run:2"]);
  });

  it("eager effects observe stabilized derived values without fractional reruns", () => {
    createRuntime({ effectStrategy: "eager" });
    const source = signal(1);
    const doubled = computed(() => source() * 2);
    const snapshots: string[] = [];

    effect(() => {
      snapshots.push(`${source()}->${doubled()}`);
    });

    expect(snapshots).toEqual(["1->2"]);

    source.set(2);

    expect(snapshots).toEqual(["1->2", "2->4"]);
  });

  it("drops stale dynamic dependencies after branch switches", () => {
    const flag = signal(true);
    const left = signal(1);
    const right = signal(10);
    const selectSpy = vi.fn(() => (flag() ? left() : right()));
    const selected = computed(selectSpy);

    expect(selected()).toBe(1);
    expect(selectSpy).toHaveBeenCalledTimes(1);

    flag.set(false);
    expect(selected()).toBe(10);
    expect(selectSpy).toHaveBeenCalledTimes(2);

    left.set(2);
    expect(selected()).toBe(10);
    expect(selectSpy).toHaveBeenCalledTimes(2);

    right.set(20);
    expect(selected()).toBe(20);
    expect(selectSpy).toHaveBeenCalledTimes(3);
  });

  it("recomputes the bottom of a diamond graph only once per source change", () => {
    const source = signal(1);
    const leftSpy = vi.fn(() => source() + 1);
    const rightSpy = vi.fn(() => source() * 2);
    const left = computed(leftSpy);
    const right = computed(rightSpy);
    const totalSpy = vi.fn(() => left() + right());
    const total = computed(totalSpy);

    expect(total()).toBe(4);
    expect(leftSpy).toHaveBeenCalledTimes(1);
    expect(rightSpy).toHaveBeenCalledTimes(1);
    expect(totalSpy).toHaveBeenCalledTimes(1);

    source.set(2);

    expect(total()).toBe(7);
    expect(leftSpy).toHaveBeenCalledTimes(2);
    expect(rightSpy).toHaveBeenCalledTimes(2);
    expect(totalSpy).toHaveBeenCalledTimes(2);
  });

  it("ignores same-value writes for effects and their cleanups", () => {
    const rt = createRuntime();
    const source = signal(1);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source();
      return cleanup;
    });

    effect(spy);

    source.set((prev: number) => prev);
    rt.flush();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("stabilizes re-entrant effects that write to their own source", () => {
    const rt = createRuntime({ effectStrategy: "flush" });
    const count = signal(0);
    const seen: number[] = [];

    effect(() => {
      const value = count();
      seen.push(value);

      if (value < 2) {
        count.set(value + 1);
      }
    });

    rt.flush();

    expect(seen).toEqual([0, 1, 2]);
    expect(count()).toBe(2);
  });

  it("skips scheduled reruns for effects disposed earlier in the same flush", () => {
    const rt = createRuntime();
    const source = signal(0);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source();
      return cleanup;
    });

    let disposeWatched = () => {};

    effect(() => {
      if (source() === 1) {
        disposeWatched();
      }
    });

    disposeWatched = effect(spy);

    source.set(1);
    rt.flush();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);

    source.set(2);
    rt.flush();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("keeps sibling effects fresh when one effect is disposed during computed stabilization", () => {
    createRuntime({ effectStrategy: "eager" });
    const source = signal(0);
    let disposeFirst!: Destructor;
    let secondValue = -1;
    let thirdValue = -1;

    const derived = computed(() => {
      const value = source();

      if (value === 1) {
        disposeFirst();
      }

      return value;
    });

    disposeFirst = effect(() => {
      derived();
    });
    effect(() => {
      secondValue = derived();
    });
    effect(() => {
      thirdValue = derived();
    });

    expect(secondValue).toBe(0);
    expect(thirdValue).toBe(0);

    source.set(1);

    expect(secondValue).toBe(1);
    expect(thirdValue).toBe(1);
  });

  it("flush effects observe one consistent snapshot after multiple writes", () => {
    const rt = createRuntime();
    const left = signal(1);
    const right = signal(10);
    const snapshots: string[] = [];

    effect(() => {
      snapshots.push(`${left()}:${right()}`);
    });

    left.set(2);
    right.set(20);

    expect(snapshots).toEqual(["1:10"]);

    rt.flush();

    expect(snapshots).toEqual(["1:10", "2:20"]);
  });

  it("reactivates a computed after its last observer is disposed", () => {
    const rt = createRuntime();
    const source = signal(1);
    const derived = computed(() => source() * 2);
    const firstValues: number[] = [];
    const secondValues: number[] = [];

    const stopFirst = effect(() => {
      firstValues.push(derived());
    });
    expect(firstValues).toEqual([2]);

    stopFirst();
    source.set(2);
    rt.flush();
    expect(firstValues).toEqual([2]);

    effect(() => {
      secondValues.push(derived());
    });
    expect(secondValues).toEqual([4]);

    source.set(3);
    rt.flush();
    expect(firstValues).toEqual([2]);
    expect(secondValues).toEqual([4, 6]);
  });
});
