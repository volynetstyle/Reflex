import { beforeEach, describe, expect, it } from "vitest";
import { effect } from "@volynets/reflex";
import {
  boardActions,
  summary,
  taskById,
} from "../examples/task-board/src/task-board";

describe("task board projections", () => {
  beforeEach(() => boardActions.reset());

  it("materializes only the source's current keyed value", () => {
    expect(taskById("T-101")?.title).toBe("Design checkout");
    expect(taskById("T-102")).toBeUndefined();

    boardActions.select("T-102");
    boardActions.flush();
    expect(taskById("T-101")).toBeUndefined();
    expect(taskById("T-102")?.title).toBe("Add audit log");
  });

  it("invalidates only activeTitle when selection changes", () => {
    const runs = {
      total: 0,
      visible: 0,
      completed: 0,
      activeTitle: 0,
      filterLabel: 0,
    };
    const stops = [
      effect(() => { void summary.total; runs.total++; }),
      effect(() => { void summary.visible; runs.visible++; }),
      effect(() => { void summary.completed; runs.completed++; }),
      effect(() => { void summary.activeTitle; runs.activeTitle++; }),
      effect(() => { void summary.filterLabel; runs.filterLabel++; }),
    ];
    const baseline = { ...runs };

    boardActions.select("T-102");
    boardActions.flush();
    expect(runs).toEqual({
      ...baseline,
      activeTitle: baseline.activeTitle + 1,
    });
    stops.forEach((stop) => stop());
  });

  it("notifies only summary properties whose values changed", () => {
    boardActions.setFilter("active");
    boardActions.select("T-102");
    boardActions.flush();

    const runs = { total: 0, visible: 0, completed: 0, activeTitle: 0 };
    const stops = [
      effect(() => { void summary.total; runs.total++; }),
      effect(() => { void summary.visible; runs.visible++; }),
      effect(() => { void summary.completed; runs.completed++; }),
      effect(() => { void summary.activeTitle; runs.activeTitle++; }),
    ];
    const baseline = { ...runs };

    boardActions.move("T-102", "active");
    boardActions.flush();
    expect(runs).toEqual({
      ...baseline,
      visible: baseline.visible + 1,
    });
    stops.forEach((stop) => stop());
  });

  it("does not notify an identical projected filter", () => {
    let runs = 0;
    const stop = effect(() => {
      void summary.filterLabel;
      void summary.visible;
      runs++;
    });
    boardActions.setFilter("active");
    boardActions.flush();
    const baseline = runs;
    boardActions.setFilter("active");
    boardActions.flush();
    expect(runs).toBe(baseline);
    stop();
  });
});
