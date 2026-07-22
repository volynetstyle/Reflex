import { beforeEach, describe, expect, it } from "vitest";
import { effect } from "@volynets/reflex";
import {
  boardActions,
  isTaskSelected,
} from "../examples/task-board/src/task-board";

describe("task board selector invalidation", () => {
  beforeEach(() => boardActions.reset());

  it("invalidates only previous and next keys in both directions", () => {
    const runs = { T101: 0, T102: 0, T103: 0, missing: 0 };
    const stops = [
      effect(() => { isTaskSelected("T-101"); runs.T101++; }),
      effect(() => { isTaskSelected("T-102"); runs.T102++; }),
      effect(() => { isTaskSelected("T-103"); runs.T103++; }),
      effect(() => { isTaskSelected("missing"); runs.missing++; }),
    ];
    const initial = { ...runs };

    boardActions.select("T-102");
    boardActions.flush();
    expect(runs).toEqual({
      T101: initial.T101 + 1,
      T102: initial.T102 + 1,
      T103: initial.T103,
      missing: initial.missing,
    });

    const forward = { ...runs };
    boardActions.select("T-101");
    boardActions.flush();
    expect(runs).toEqual({
      T101: forward.T101 + 1,
      T102: forward.T102 + 1,
      T103: forward.T103,
      missing: forward.missing,
    });

    const reverse = { ...runs };
    boardActions.select("missing");
    boardActions.flush();
    expect(runs).toEqual({
      T101: reverse.T101 + 1,
      T102: reverse.T102,
      T103: reverse.T103,
      missing: reverse.missing + 1,
    });
    stops.forEach((stop) => stop());
  });

  it("does not rerun a key subscriber for identical selection", () => {
    let runs = 0;
    const stop = effect(() => {
      isTaskSelected("T-101");
      runs++;
    });
    const baseline = runs;
    boardActions.select("T-101");
    boardActions.flush();
    expect(runs).toBe(baseline);
    stop();
  });
});
