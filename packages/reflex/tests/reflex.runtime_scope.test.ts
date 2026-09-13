import { Scheduled } from "@volynets/reflex-runtime/internal";
import { describe, expect, it } from "vitest";
import { createRuntime, effect, flush, signal } from "../src";

describe("Reactive system - runtime", () => {
  it.each(["flush", "eager", "sab"] as const)(
    "installs scheduler and external hooks together for %s",
    (effectStrategy) => {
      const events: string[] = [];
      const runtime = createRuntime({
        effectStrategy,
        hooks: {
          onNodeInvalidated(node) {
            expect(node.state & Scheduled).toBe(Scheduled);
            events.push("invalidated");
          },
          onRuntimeIdle() {
            events.push("idle");
          },
        },
      });
      const source = signal(0);
      const stop = effect(() => {
        source();
        events.push("effect");
      });
      events.length = 0;

      runtime.batch(() => source.set(1));
      expect(events).toEqual(
        effectStrategy === "flush"
          ? ["invalidated", "idle"]
          : ["invalidated", "effect", "idle"],
      );
      runtime.flush();
      expect(events.filter((event) => event === "effect")).toHaveLength(1);
      stop();
    },
  );

  it("routes top-level helpers through the latest runtime", () => {
    const first = createRuntime({ effectStrategy: "flush" });
    const second = createRuntime({ effectStrategy: "flush" });

    const count = signal(0);
    const seen: number[] = [];

    effect(() => {
      seen.push(count());
    });

    count.set(1);
    first.flush();

    expect(seen).toEqual([0]);

    second.flush();

    expect(seen).toEqual([0, 1]);
  });

  it("retargets top-level effects when a new default runtime is created", () => {
    const firstDefault = createRuntime({ effectStrategy: "flush" });
    const count = signal(0);
    const seen: number[] = [];

    effect(() => {
      seen.push(count());
    });

    expect(seen).toEqual([0]);

    const secondDefault = createRuntime({ effectStrategy: "flush" });

    count.set(1);
    firstDefault.flush();

    expect(seen).toEqual([0]);

    secondDefault.flush();

    expect(seen).toEqual([0, 1]);
  });

  it("keeps queued work reachable when the default runtime is replaced", () => {
    createRuntime({ effectStrategy: "flush" });
    const count = signal(0);
    const seen: number[] = [];

    effect(() => {
      seen.push(count());
    });
    count.set(1);

    createRuntime({ effectStrategy: "flush" });
    flush();

    expect(seen).toEqual([0, 1]);
  });

  it("exposes the execution context on the runtime handle", () => {
    const runtime = createRuntime({ effectStrategy: "flush" });
    expect(runtime.ctx).toBeDefined();
    expect(typeof runtime.ctx).toBe("object");
    expect(runtime.ctx.execution).toBeDefined();
  });

  it("keeps instance hooks isolated across runtime handles", () => {
    const firstSettled: string[] = [];
    const secondSettled: string[] = [];

    const first = createRuntime({
      effectStrategy: "flush",
      hooks: {
        onRuntimeIdle() {
          firstSettled.push("first");
        },
      },
    });
    const firstCount = first.batch(() => signal(0));

    const second = createRuntime({
      effectStrategy: "flush",
      hooks: {
        onRuntimeIdle() {
          secondSettled.push("second");
        },
      },
    });
    const secondCount = second.batch(() => signal(0));

    first.batch(() => {
      effect(() => {
        firstCount();
      });
    });
    second.batch(() => {
      effect(() => {
        secondCount();
      });
    });

    firstSettled.length = 0;
    secondSettled.length = 0;

    first.batch(() => {
      firstCount.set(1);
    });

    expect(firstSettled).toEqual(["first"]);
    expect(secondSettled).toEqual([]);

    second.batch(() => {
      secondCount.set(1);
    });

    expect(firstSettled).toEqual(["first"]);
    expect(secondSettled).toEqual(["second"]);
  });
});
