import { describe, expect, it, vi } from "vitest";
import {
  effect,
  effectScheduled,
  effectUnscheduled,
  isEffectScheduled,
} from "../src/api/effect";
import { createWatcherNode } from "../src/infra/factory";
import { batch, createRuntime, memo, signal } from "./reflex.test_utils";

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

  it("reruns all invalidated effects that fan out from one source", () => {
    let invalidations = 0;
    createRuntime({
      effectStrategy: "eager",
      hooks: {
        onEffectInvalidated() {
          ++invalidations;
        },
      },
    });
    const [source, setSource] = signal(1);
    const doubled = memo(() => source() * 2);
    const direct = vi.fn(() => source());
    const derivedA = vi.fn(() => doubled());
    const derivedB = vi.fn(() => doubled());

    effect(direct);
    effect(derivedA);
    effect(derivedB);

    expect(direct).toHaveBeenCalledTimes(1);
    expect(derivedA).toHaveBeenCalledTimes(1);
    expect(derivedB).toHaveBeenCalledTimes(1);

    setSource(2);

    expect(invalidations).toBe(3);
    expect(direct).toHaveBeenCalledTimes(2);
    expect(derivedA).toHaveBeenCalledTimes(2);
    expect(derivedB).toHaveBeenCalledTimes(2);
  });

  it("defers eager effect flushing until the outer batch exits", () => {
    createRuntime({ effectStrategy: "eager" });
    const [source, setSource] = signal(0);
    const seen: number[] = [];

    effect(() => {
      seen.push(source());
    });

    const result = batch(() => {
      setSource(1);
      setSource(2);
      expect(seen).toEqual([0]);
      return source();
    });

    expect(result).toBe(2);
    expect(seen).toEqual([0, 2]);
  });

  it("keeps flush-mode effects queued after batch until runtime flush", () => {
    const rt = createRuntime();
    const [source, setSource] = signal(0);
    const seen: number[] = [];

    effect(() => {
      seen.push(source());
    });

    const result = rt.batch(() => {
      setSource(1);
      setSource(2);
      expect(seen).toEqual([0]);
      return source();
    });

    expect(result).toBe(2);
    expect(seen).toEqual([0]);

    rt.flush();
    expect(seen).toEqual([0, 2]);
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

  it("notifies custom invalidation hooks before flush", () => {
    let invalidations = 0;
    const rt = createRuntime({
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

  it("toggles the scheduler-owned queued helpers", () => {
    const node = createWatcherNode(() => {});

    effectScheduled(node);
    expect(isEffectScheduled(node)).toBe(true);

    effectUnscheduled(node);
    expect(isEffectScheduled(node)).toBe(false);
  });
});
