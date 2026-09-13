import { describe, expect, it, vi } from "vitest";

const devRecordPropagate = vi.hoisted(() => vi.fn());

vi.mock("@runtime/kernel/dev", () => ({ devRecordPropagate }));

import { observeRuntimePropagate } from "@runtime/kernel/projection.propagate";
import type { RuntimeDebugContext } from "@runtime/kernel/config";
import type { ReactiveEdge } from "@runtime/kernel/shape";

describe("projection propagate compatibility", () => {
  it("preserves payload identity and temporal ordering", () => {
    const first = { from: {}, to: {} } as ReactiveEdge;
    const second = { from: {}, to: {} } as ReactiveEdge;
    const context = { scope: "runtime" } as RuntimeDebugContext;

    observeRuntimePropagate?.({
      edge: first,
      nextState: 6,
      immediate: true,
      context,
    });
    observeRuntimePropagate?.({
      edge: second,
      nextState: 4,
      immediate: false,
      context,
    });

    expect(devRecordPropagate.mock.calls).toEqual([
      [first, 6, true, context],
      [second, 4, false, context],
    ]);
  });
});
