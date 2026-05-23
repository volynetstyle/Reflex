import { describe, expect, it } from "vitest";
import {
  createRuntime,
  effect,
  signal,
} from "../src";

describe("Reactive system - runtime", () => {
  it("routes top-level helpers through the latest runtime", () => {
    const first = createRuntime({ effectStrategy: "flush" });
    const second = createRuntime({ effectStrategy: "flush" });

    const [count, setCount] = signal(0);
    const seen: number[] = [];

    effect(() => {
      seen.push(count());
    });

    setCount(1);
    first.flush();

    expect(seen).toEqual([0]);

    second.flush();

    expect(seen).toEqual([0, 1]);
  });

  it("retargets top-level effects when a new default runtime is created", () => {
    const firstDefault = createRuntime({ effectStrategy: "flush" });
    const [count, setCount] = signal(0);
    const seen: number[] = [];

    effect(() => {
      seen.push(count());
    });

    expect(seen).toEqual([0]);

    const secondDefault = createRuntime({ effectStrategy: "ranked" });

    setCount(1);
    firstDefault.flush();

    expect(seen).toEqual([0]);

    secondDefault.flush();

    expect(seen).toEqual([0, 1]);
  });

  it("exposes the execution context on the runtime handle", () => {
    const runtime = createRuntime({ effectStrategy: "flush" });
    expect(runtime.ctx).toBeDefined();
    expect(typeof runtime.ctx).toBe("object");
  });
});
