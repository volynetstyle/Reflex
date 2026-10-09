import { describe, expect, it } from "vitest";
import { createMountEffects } from "../src/runtime/mount-effects";

describe("DOM render effect scheduler", () => {
  it("runs mount effects in FIFO order", () => {
    const scheduler = createMountEffects();
    const log: string[] = [];

    scheduler.schedule(() => log.push("after"));
    scheduler.schedule(() => log.push("render"));
    scheduler.schedule(() => log.push("before"));

    scheduler.flush();

    expect(log).toEqual(["after", "render", "before"]);
  });

  it("cancels pending tasks and drains reentrant tasks without shifting", () => {
    const scheduler = createMountEffects();
    const log: string[] = [];

    const cancel = scheduler.schedule(() => log.push("cancelled"));
    cancel();

    scheduler.schedule(() => {
      log.push("first");
      scheduler.schedule(() => log.push("second"));
    });

    scheduler.flush();

    expect(log).toEqual(["first", "second"]);
  });
});
