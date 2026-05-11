import { describe, expect, it } from "vitest";
import {
  computed,
  effect,
  getActiveSub,
  setupAlienRuntime,
  signal,
} from "./alien-compat";

describe("alien-signals issue #109 edge cases", () => {
  it("self-dispose inside effect: code after dispose() still runs", () => {
    setupAlienRuntime();

    const s = signal(0);
    let dispose!: () => void;
    const stages: string[] = [];

    dispose = effect(() => {
      stages.push("start");
      s();
      if (s() === 1) {
        dispose();
        stages.push("after-dispose");
      }
      stages.push("end");
    });

    expect(stages).toEqual(["start", "end"]);
    s(1);
    expect(stages).toEqual([
      "start",
      "end",
      "start",
      "after-dispose",
      "end",
    ]);
  });

  it("disposed-by-other-node effect: scheduled run is skipped entirely", () => {
    setupAlienRuntime();

    const s = signal(0);
    let dispose!: () => void;
    let bodyRuns = 0;

    const a = computed(() => {
      if (s() === 1) dispose();
      return s();
    });

    dispose = effect(() => {
      a();
      bodyRuns++;
    });
    effect(() => {
      a();
    });

    expect(bodyRuns).toBe(1);
    s(1);
    expect(bodyRuns).toBe(1);
  });

  it("disposed effect: graph state is fully cleaned up", () => {
    setupAlienRuntime();

    const s = signal(0);
    let dispose!: () => void;
    let e1Node: ReturnType<typeof getActiveSub> | undefined;

    const a = computed(() => {
      if (s() === 1) dispose();
      return s();
    });

    dispose = effect(() => {
      e1Node ??= getActiveSub();
      a();
    });
    effect(() => {
      a();
    });

    s(1);

    expect(e1Node).toBeDefined();
    expect(e1Node!.firstIn).toBeNull();
    expect(e1Node!.lastIn).toBeNull();
  });
});
