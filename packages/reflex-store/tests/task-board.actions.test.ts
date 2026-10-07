import { beforeEach, describe, expect, it } from "vitest";
import { effect } from "@volynets/reflex";
import { boardActions, tasks } from "../examples/task-board/src/task-board";

describe("task board actions and allocation", () => {
  beforeEach(() => boardActions.reset());

  it("keeps the map unchanged for missing and no-op moves", () => {
    const before = [...tasks.entries()];
    boardActions.move("missing", "done");
    boardActions.move("T-101", "active");
    expect([...tasks.entries()]).toEqual(before);
    expect(tasks.get("T-101")).toBe(before[0]![1]);
  });

  it("replaces only the moved task", () => {
    const before = [...tasks.values()];
    boardActions.move("T-102", "active");
    const after = [...tasks.values()];

    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[2]).toBe(before[2]);
  });

  it("does not invalidate a key subscriber for an unchanged status", () => {
    let runs = 0;
    const stop = effect(() => {
      tasks.get("T-101");
      runs++;
    });
    const baseline = runs;
    boardActions.move("T-101", "active");
    boardActions.flush();
    expect(runs).toBe(baseline);
    stop();
  });
});
