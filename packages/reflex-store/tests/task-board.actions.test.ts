import { beforeEach, describe, expect, it } from "vitest";
import { effect } from "@volynets/reflex";
import {
  boardActions,
  tasks,
} from "../examples/task-board/src/task-board";

describe("task board actions and allocation", () => {
  beforeEach(() => boardActions.reset());

  it("preserves the task array for missing and no-op moves", () => {
    const before = tasks();
    boardActions.move("missing", "done");
    expect(tasks()).toBe(before);
    boardActions.move("T-101", "active");
    expect(tasks()).toBe(before);
  });

  it("allocates one array and one changed task for a real move", () => {
    const before = tasks();
    boardActions.move("T-102", "active");
    const after = tasks();

    expect(after).not.toBe(before);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[2]).toBe(before[2]);
  });

  it("does not invalidate task subscribers for an unchanged status", () => {
    let runs = 0;
    const stop = effect(() => {
      tasks();
      runs++;
    });
    const baseline = runs;
    boardActions.move("T-101", "active");
    boardActions.flush();
    expect(runs).toBe(baseline);
    stop();
  });
});
