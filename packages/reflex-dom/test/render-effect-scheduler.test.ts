import { describe, expect, it } from "vitest";
import {
  RenderEffectPhase,
  createRenderEffectScheduler,
} from "../src/runtime/render-effect-scheduler";

describe("DOM render effect scheduler", () => {
  it("flushes phases in render order", () => {
    const scheduler = createRenderEffectScheduler();
    const log: string[] = [];

    scheduler.schedule(() => log.push("after"), RenderEffectPhase.AfterRender);
    scheduler.schedule(() => log.push("render"), RenderEffectPhase.Render);
    scheduler.schedule(() => log.push("before"), RenderEffectPhase.BeforeRender);

    scheduler.flush();

    expect(log).toEqual(["before", "render", "after"]);
  });

  it("cancels pending tasks and drains reentrant tasks without shifting", () => {
    const scheduler = createRenderEffectScheduler();
    const log: string[] = [];

    const cancel = scheduler.schedule(() => log.push("cancelled"));
    cancel();

    scheduler.schedule(() => {
      log.push("first");
      scheduler.schedule(() => log.push("second"));
    });

    scheduler.flush(RenderEffectPhase.Render);

    expect(log).toEqual(["first", "second"]);
  });
});
