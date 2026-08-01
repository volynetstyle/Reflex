import { beforeEach, describe, expect, it } from "vitest";
import { effect } from "@volynets/reflex";
import {
  boardActions,
  runTaskBoardScenario,
  summary,
} from "../examples/task-board/src/task-board";

describe("task board semantics", () => {
  beforeEach(() => boardActions.reset());

  it("runs effects immediately and produces the expected scenario", () => {
    expect(runTaskBoardScenario()).toEqual({
      activeTask: "Add audit log",
      completed: 1,
      isSelected: true,
      renders: [
        "all|3|1|Design checkout",
        "active|1|1|Add audit log",
        "active|2|1|Add audit log",
      ],
      total: 3,
      visible: 2,
    });
  });

  it("batches multiple writes into one effect run after flush", () => {
    const renders: string[] = [];
    const stop = effect(() => {
      renders.push(`${summary.filterLabel}|${summary.visible}`);
    });
    renders.length = 0;

    boardActions.setFilter("active", "checkout");
    expect(renders).toEqual([]);
    boardActions.flush();

    expect(renders).toEqual(["active:checkout|1"]);
    stop();
  });

  it("keeps projection reads scheduler-driven until flush", () => {
    expect(summary.visible).toBe(3);
    boardActions.setFilter("done");
    expect(summary.visible).toBe(3);
    boardActions.flush();
    expect(summary.visible).toBe(1);
  });

  it("stops reacting after idempotent disposal", () => {
    let runs = 0;
    const stop = effect(() => {
      void summary.visible;
      runs++;
    });
    const baseline = runs;
    expect(() => {
      stop();
      stop();
    }).not.toThrow();

    boardActions.setFilter("done");
    boardActions.flush();
    expect(runs).toBe(baseline);
  });
});
