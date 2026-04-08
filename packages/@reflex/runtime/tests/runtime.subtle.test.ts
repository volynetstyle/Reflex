import { beforeEach, describe, expect, it, vi } from "vitest";
import { subtle } from "../src";
import { createProducer, resetRuntime } from "./runtime.test_utils";

describe("Reactive runtime - subtle debug surface", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("stays inert outside debug builds", () => {
    // const source = createProducer(1);
    // const listener = vi.fn();

    // const unsubscribe = subtle.observe(listener);

    // expect(subtle.enabled).toBe(false);
    // expect(subtle.currentComputed()).toBeUndefined();
    // expect(subtle.context()).toBeUndefined();
    // expect(subtle.configure({ historyLimit: 10 })).toBeUndefined();
    // expect(subtle.label(source, "counter")).toBe(source);
    // expect(subtle.snapshot(source)).toBeUndefined();
    // expect(subtle.history()).toEqual([]);

    // subtle.clearHistory();
    // unsubscribe();

    // expect(listener).not.toHaveBeenCalled();
  });
});
