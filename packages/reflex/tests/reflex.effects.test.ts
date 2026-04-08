import { describe, expect, it, vi } from "vitest";
import { ReactiveNodeState } from "../../@reflex/runtime/src/reactivity/shape/ReactiveMeta";
import { effect, effectScheduled, effectUnscheduled } from "../src/api/effect";
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
