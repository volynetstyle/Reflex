import { describe, expect, it } from "vitest";
import { reconcileKeyedList, type KeyedItem } from "../src/reconcile/keyed";
import {
  applyKeyedListChange,
  createKeyedListState,
  type DeltaKeyedHooks,
} from "../src/reconcile/keyed-delta";

interface Item {
  id: number;
  value: string;
}

interface Row extends KeyedItem<Item> {
  index: number;
  start: HTMLElement;
}

function createHarness() {
  const container = document.createElement("div");
  const endAnchor = document.createComment("end");
  container.append(endAnchor);
  document.body.append(container);

  const hooks: DeltaKeyedHooks<Item, Row> = {
    endAnchor,
    getKey: (item) => item.id,
    getStart: (row) => row.start,
    mount(item, key, index, before) {
      const start = document.createElement("span");
      start.dataset.key = String(key);
      start.textContent = item.value;
      container.insertBefore(start, before);
      return { key, value: item, index, start };
    },
    update(row, item, index) {
      row.value = item;
      row.index = index;
      row.start.textContent = item.value;
    },
    updateIndex(row, index) {
      row.index = index;
    },
    move(row, before) {
      container.insertBefore(row.start, before);
    },
    moveRange(rows, before) {
      const fragment = document.createDocumentFragment();
      for (const row of rows) fragment.append(row.start);
      container.insertBefore(fragment, before);
    },
    remove(row) {
      row.start.remove();
    },
  };

  return { container, hooks, dispose: () => container.remove() };
}

describe("keyed reconciliation in Chromium", () => {
  it("applies snapshot and delta changes to real DOM", () => {
    const before = [1, 2, 3, 4].map((id) => ({ id, value: String(id) }));
    const harness = createHarness();
    const rows = reconcileKeyedList([], before, harness.hooks).rows;
    const state = createKeyedListState(before, rows);
    const originalTwo = state.rowByKey.get(2)!.start;

    const updated = { id: 2, value: "two" };
    const afterUpdate = before.with(1, updated);
    applyKeyedListChange(
      state,
      {
        type: "patch",
        baseRevision: 0,
        revision: 1,
        operations: [{ type: "update", index: 1, item: updated }],
        snapshot: afterUpdate,
      },
      harness.hooks,
    );

    const afterMove = [
      afterUpdate[2]!,
      afterUpdate[3]!,
      ...afterUpdate.slice(0, 2),
    ];
    applyKeyedListChange(
      state,
      {
        type: "patch",
        baseRevision: 1,
        revision: 2,
        operations: [{ type: "move", from: 0, count: 2, to: 2 }],
        snapshot: afterMove,
      },
      harness.hooks,
    );

    expect(harness.container.textContent).toBe("341two");
    expect(state.rowByKey.get(2)!.start).toBe(originalTwo);
    expect(state.rows.map((row) => row.index)).toEqual([0, 1, 2, 3]);
    harness.dispose();
  });
});
