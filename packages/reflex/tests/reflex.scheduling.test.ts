import { describe, expect, it, vi } from "vitest";
import { computed, createRuntime, memo, signal } from "./reflex.test_utils";

describe("Reactive system - laziness and runtime coordination", () => {
  it("keeps computeds lazy until their first read", () => {
    createRuntime();
    const [source, setSource] = signal(1);
    const spy = vi.fn(() => source() * 2);
    const derived = computed(spy);

    setSource(2);

    expect(spy).not.toHaveBeenCalled();
    expect(derived()).toBe(4);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("flush is a no-op for pure computed reads", () => {
    const rt = createRuntime();
    const [source, setSource] = signal(1);
    const doubled = computed(() => source() * 2);

    setSource(3);
    rt.flush();

    expect(doubled()).toBe(6);
  });

  it("memo precomputes eagerly once", () => {
    createRuntime();
    const [source] = signal(3);
    const spy = vi.fn(() => source() + 1);
    const warmed = memo(spy);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(warmed()).toBe(4);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ctx getter returns the current runtime context", () => {
    const rt = createRuntime();

    expect(rt.ctx).toBeTruthy();
    expect(typeof rt.ctx.resetState).toBe("function");
  });
});
