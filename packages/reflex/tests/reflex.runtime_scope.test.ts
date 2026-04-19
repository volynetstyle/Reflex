import { describe, expect, it } from "vitest";
import {
  createRuntime,
  createScopedRuntime,
  effect,
  signal,
} from "../src";
import { createProjection } from "../src/unstable";

describe("Reactive system - scoped runtime", () => {
  it("keeps scoped runtimes isolated from each other", () => {
    const first = createScopedRuntime({ effectStrategy: "flush" });
    const second = createScopedRuntime({ effectStrategy: "flush" });

    const [left, setLeft] = first.signal(0);
    const [right, setRight] = second.signal(0);

    const leftSeen: number[] = [];
    const rightSeen: number[] = [];

    first.effect(() => {
      leftSeen.push(left());
    });
    second.effect(() => {
      rightSeen.push(right());
    });

    expect(leftSeen).toEqual([0]);
    expect(rightSeen).toEqual([0]);

    setLeft(1);
    first.flush();

    expect(leftSeen).toEqual([0, 1]);
    expect(rightSeen).toEqual([0]);

    setRight(2);
    first.flush();

    expect(leftSeen).toEqual([0, 1]);
    expect(rightSeen).toEqual([0]);

    second.flush();

    expect(leftSeen).toEqual([0, 1]);
    expect(rightSeen).toEqual([0, 2]);
  });

  it("does not retarget existing effects when a new default runtime is created", () => {
    const firstDefault = createRuntime({ effectStrategy: "flush" });
    const [count, setCount] = signal(0);
    const seen: number[] = [];

    effect(() => {
      seen.push(count());
    });

    expect(seen).toEqual([0]);

    createRuntime({ effectStrategy: "ranked" });

    setCount(1);
    firstDefault.flush();

    expect(seen).toEqual([0, 1]);
  });

  it("binds top-level helpers to the ambient scoped runtime inside run()", () => {
    const runtime = createScopedRuntime({ effectStrategy: "flush" });
    const [count, setCount] = signal(0);
    const seen: number[] = [];

    runtime.run(() => {
      effect(() => {
        seen.push(count());
      });
    });

    expect(seen).toEqual([0]);

    setCount(1);
    runtime.flush();

    expect(seen).toEqual([0, 1]);
  });

  it("binds unstable projection watchers to the ambient scoped runtime inside run()", () => {
    const runtime = createScopedRuntime({ effectStrategy: "flush" });
    const [entity, setEntity] = runtime.signal({ id: "a", label: "one" });
    const seen: string[] = [];

    runtime.run(() => {
      const labels = createProjection(
        entity,
        (value) => value.id,
        (value) => value.label,
      );

      effect(() => {
        seen.push(String(labels("b")));
      });
    });

    expect(seen).toEqual(["undefined"]);

    setEntity({ id: "b", label: "two" });
    runtime.flush();

    expect(seen).toEqual(["undefined", "two"]);
  });
});
