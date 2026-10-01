import { describe, expect, it } from "vitest";
import { createMountEffects } from "../src/runtime/mount-effects";

describe("mount effect delivery", () => {
  it("cancels a task after the drain has already started", () => {
    const queue = createMountEffects();
    const log: string[] = [];
    queue.schedule(() => {
      log.push("first");
      cancel();
    });
    const cancel = queue.schedule(() => log.push("cancelled"));
    queue.flush();
    queue.flush();
    expect(log).toEqual(["first"]);
  });

  it("drains surviving and reentrant tasks before rethrowing the first error", () => {
    const queue = createMountEffects();
    const log: string[] = [];
    const error = new Error("mount failed");
    queue.schedule(() => {
      queue.schedule(() => log.push("nested"));
      throw error;
    });
    queue.schedule(() => log.push("surviving"));
    expect(() => queue.flush()).toThrow(error);
    expect(log).toEqual(["surviving", "nested"]);
    queue.schedule(() => log.push("recovered"));
    queue.flush();
    expect(log).toEqual(["surviving", "nested", "recovered"]);
  });

  it("preserves even an undefined thrown value", () => {
    const queue = createMountEffects();
    queue.schedule(() => {
      throw undefined;
    });
    let caught = false;
    try {
      queue.flush();
    } catch (error) {
      caught = true;
      expect(error).toBeUndefined();
    }
    expect(caught).toBe(true);
  });
});
