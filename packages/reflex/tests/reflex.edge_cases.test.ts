import { describe, expect, it, vi } from "vitest";
import { computed, createRuntime, effect, signal } from "./reflex.test_utils";

describe("Reactive system - edge cases", () => {
  it("keeps cleanup reads untracked so they do not create ghost reruns", () => {
    const rt = createRuntime();
    const [source, setSource] = signal(1);
    const [cleanupSource, setCleanupSource] = signal(10);
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

    setSource(2);
    rt.flush();

    expect(log).toEqual(["run:1", "cleanup:20", "run:2"]);
    expect(cleanupDerivedSpy).toHaveBeenCalledTimes(1);

    setCleanupSource(11);
    rt.flush();

    expect(log).toEqual(["run:1", "cleanup:20", "run:2"]);
  });

  it("eager effects observe stabilized derived values without fractional reruns", () => {
    createRuntime({ effectStrategy: "eager" });
    const [source, setSource] = signal(1);
    const doubled = computed(() => source() * 2);
    const snapshots: string[] = [];

    effect(() => {
      snapshots.push(`${source()}->${doubled()}`);
    });

    expect(snapshots).toEqual(["1->2"]);

    setSource(2);

    expect(snapshots).toEqual(["1->2", "2->4"]);
  });

  it("eager effects batch rereads of shared subgraphs into one rerun per invalidation", () => {
    createRuntime({ effectStrategy: "eager" });
    const [source, setSource] = signal(1);
    const leaves = Array.from({ length: 6 }, (_, index) =>
      computed(() => source() * (index + 1)),
    );
    const shared = computed(() => {
      let total = 0;
      for (let index = 0; index < leaves.length; ++index) {
        total += leaves[index]!();
      }
      return total;
    });
    const effects = Array.from({ length: 4 }, () =>
      vi.fn(() => shared() + leaves[0]!()),
    );

    for (let index = 0; index < effects.length; ++index) {
      effect(effects[index]!);
    }

    setSource(2);

    for (let index = 0; index < effects.length; ++index) {
      expect(effects[index]).toHaveBeenCalledTimes(2);
    }
  });

  it("drops stale dynamic dependencies after branch switches", () => {
    const [flag, setFlag] = signal(true);
    const [left, setLeft] = signal(1);
    const [right, setRight] = signal(10);
    const selectSpy = vi.fn(() => (flag() ? left() : right()));
    const selected = computed(selectSpy);

    expect(selected()).toBe(1);
    expect(selectSpy).toHaveBeenCalledTimes(1);

    setFlag(false);
    expect(selected()).toBe(10);
    expect(selectSpy).toHaveBeenCalledTimes(2);

    setLeft(2);
    expect(selected()).toBe(10);
    expect(selectSpy).toHaveBeenCalledTimes(2);

    setRight(20);
    expect(selected()).toBe(20);
    expect(selectSpy).toHaveBeenCalledTimes(3);
  });

  it("recomputes the bottom of a diamond graph only once per source change", () => {
    const [source, setSource] = signal(1);
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

    setSource(2);

    expect(total()).toBe(7);
    expect(leftSpy).toHaveBeenCalledTimes(2);
    expect(rightSpy).toHaveBeenCalledTimes(2);
    expect(totalSpy).toHaveBeenCalledTimes(2);
  });

  it("ignores same-value writes for effects and their cleanups", () => {
    const rt = createRuntime();
    const [source, setSource] = signal(1);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source();
      return cleanup;
    });

    effect(spy);

    setSource((prev) => prev);
    rt.flush();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("stabilizes re-entrant effects that write to their own source", () => {
    const rt = createRuntime();
    const [count, setCount] = signal(0);
    const seen: number[] = [];

    effect(() => {
      const value = count();
      seen.push(value);

      if (value < 2) {
        setCount(value + 1);
      }
    });

    rt.flush();

    expect(seen).toEqual([0, 1, 2]);
    expect(count()).toBe(2);
  });

  it("skips scheduled reruns for effects disposed earlier in the same flush", () => {
    const rt = createRuntime();
    const [source, setSource] = signal(0);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source();
      return cleanup;
    });

    let disposeWatched: Destructor = () => {};

    effect(() => {
      if (source() === 1) {
        disposeWatched();
      }
    });

    disposeWatched = effect(spy);

    setSource(1);
    rt.flush();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);

    setSource(2);
    rt.flush();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("flush effects observe one consistent snapshot after multiple writes", () => {
    const rt = createRuntime();
    const [left, setLeft] = signal(1);
    const [right, setRight] = signal(10);
    const snapshots: string[] = [];

    effect(() => {
      snapshots.push(`${left()}:${right()}`);
    });

    setLeft(2);
    setRight(20);

    expect(snapshots).toEqual(["1:10"]);

    rt.flush();

    expect(snapshots).toEqual(["1:10", "2:20"]);
  });
});
