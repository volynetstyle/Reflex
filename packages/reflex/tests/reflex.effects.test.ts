import { describe, expect, it, vi } from "vitest";
import {
  effect,
  effectScheduled,
  effectUnscheduled,
  reaction,
  watch,
} from "../src/api/effect";
import { createWatcherNode } from "../src/infra/factory";
import { createRuntime, memo, signal } from "./reflex.test_utils";
import { Scheduled } from "@volynets/reflex-runtime";

describe("Reactive system - effects", () => {
  it("runs once immediately and reruns after flush", () => {
    const rt = createRuntime();
    const source = signal(1);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source();
      return cleanup;
    });

    const scope = effect(spy);

    expect(spy).toHaveBeenCalledTimes(1);

    source.set(2);
    expect(spy).toHaveBeenCalledTimes(1);

    rt.flush();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(2);

    scope();
    expect(cleanup).toHaveBeenCalledTimes(2);

    source.set(3);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("flushes eagerly when runtime uses eager strategy", () => {
    createRuntime({ effectStrategy: "eager" });
    const source = signal(1);
    const spy = vi.fn(() => {
      source();
    });

    effect(spy);
    expect(spy).toHaveBeenCalledTimes(1);

    source.set(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("can flush after batch exits in sab mode", () => {
    const rt = createRuntime({
      effectStrategy: "sab",
    });
    const source = signal(1);
    const spy = vi.fn(() => {
      source();
    });

    effect(spy);
    expect(spy).toHaveBeenCalledTimes(1);

    rt.batch(() => {
      source.set(2);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("reruns after transitive memo invalidation on flush", () => {
    const rt = createRuntime();
    const source = signal(1);
    const inner = memo(() => source() + 1);
    const outer = memo(() => inner() + 1);
    const spy = vi.fn(() => {
      outer();
    });

    effect(spy);
    expect(spy).toHaveBeenCalledTimes(1);

    source.set(2);
    expect(spy).toHaveBeenCalledTimes(1);

    rt.flush();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("propagates through long linear chains without dropping updates", () => {
    const rt = createRuntime();
    const source = signal(73);
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

    source.set(75);
    rt.flush();

    for (const depth of [47, 95, 143, 191]) {
      expect(tapValues.get(depth)).toBe(75 + expectedPrefixSum(depth));
    }
  });

  it("callable scope disposes the effect", () => {
    const rt = createRuntime();
    const source = signal(1);
    const cleanup = vi.fn();
    const spy = vi.fn(() => {
      source();
      return cleanup;
    });

    const scope = effect(spy);
    scope();

    expect(cleanup).toHaveBeenCalledTimes(1);

    source.set(2);
    rt.flush();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("notifies custom invalidation hooks before flush", () => {
    let invalidations = 0;
    const rt = createRuntime({
      effectStrategy: "flush",
      hooks: {
        onNodeInvalidated() {
          invalidations += 1;
        },
      },
    });
    const source = signal(1);

    effect(() => {
      source();
    });

    source.set(2);
    expect(invalidations).toBe(1);

    rt.flush();
    expect(invalidations).toBe(1);
  });

  it("toggles the scheduled flag helpers", () => {
    const node = createWatcherNode(() => {});

    effectScheduled(node);
    expect(node.state & Scheduled).toBeTruthy();

    effectUnscheduled(node);
    expect(node.state & Scheduled).toBeFalsy();
  });

  it("subscribes to watched selector changes with previous value", () => {
    const rt = createRuntime();
    const name = signal("Ada");
    const spy = vi.fn();

    const stop = watch(() => name()).subscribe(spy);

    expect(spy).not.toHaveBeenCalled();

    name.set("Grace");
    rt.flush();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith("Grace", "Ada");

    name.set("Katherine");
    rt.flush();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith("Katherine", "Grace");

    stop();
    name.set("Margaret");
    rt.flush();

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("subscribes to reaction selector changes with previous value", () => {
    const rt = createRuntime();
    const name = signal("Ada");
    const spy = vi.fn();

    const stop = reaction(() => name()).subscribe(spy);

    name.set("Grace");
    rt.flush();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith("Grace", "Ada");

    stop();
  });

  it("does not track reads inside reaction subscribers", () => {
    const rt = createRuntime();
    const source = signal(0);
    const incidental = signal("a");
    const spy = vi.fn(() => {
      incidental();
    });

    reaction(() => source()).subscribe(spy);

    incidental.set("b");
    rt.flush();

    expect(spy).not.toHaveBeenCalled();

    source.set(1);
    rt.flush();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(1, 0);
  });

  it("#48 disposes nested reactions during propagation", () => {
    createRuntime({ effectStrategy: "eager" });
    const source = signal(0);
    const innerSpy = vi.fn();
    let disposeInner: Destructor | undefined;

    reaction(() => source()).subscribe((val) => {
      if (val === 1) {
        disposeInner = reaction(() => source()).subscribe(() => {
          innerSpy();
        });
      } else if (val === 2) {
        disposeInner!();
      }
    });

    source.set(1);
    source.set(2);
    source.set(3);

    expect(innerSpy).toHaveBeenCalledTimes(0);
  });
});
