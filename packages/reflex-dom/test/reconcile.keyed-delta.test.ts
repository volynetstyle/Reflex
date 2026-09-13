import { describe, expect, it, vi } from "vitest";
import {
  applyKeyedListChange,
  createKeyedListState,
  type DeltaKeyedHooks,
  type KeyedListChange,
} from "../src/reconcile/keyed-delta";
import { reconcileKeyedList, type KeyedItem } from "../src/reconcile/keyed";

interface Item {
  id: number;
  label: string;
}

interface Row extends KeyedItem<Item> {
  start: Node;
  index: number;
}

function setup(items: readonly Item[]) {
  const endAnchor = document.createComment("end");
  const getKey = vi.fn((item: Item) => item.id);
  const moveRange = vi.fn();
  const hooks: DeltaKeyedHooks<Item, Row> = {
    endAnchor,
    getKey,
    getStart: (row) => row.start,
    mount: (item, key, index) => ({
      key,
      value: item,
      index,
      start: document.createComment(String(key)),
    }),
    update: (row, item, index) => {
      row.value = item;
      row.index = index;
    },
    updateIndex: (row, index) => {
      row.index = index;
    },
    move: vi.fn(),
    moveRange,
    remove: vi.fn(),
  };
  const rows = reconcileKeyedList([], items, hooks).rows;
  const state = createKeyedListState(items, rows, 1);
  getKey.mockClear();
  return { state, hooks, getKey, moveRange };
}

describe("versioned keyed delta reconciliation", () => {
  it("updates one row without scanning the snapshot", () => {
    const initial = Array.from({ length: 1_000 }, (_, id) => ({
      id,
      label: String(id),
    }));
    const { state, hooks, getKey } = setup(initial);
    const item = { id: 500, label: "updated" };

    applyKeyedListChange(
      state,
      {
        type: "patch",
        baseRevision: 1,
        revision: 2,
        operations: [{ type: "update", index: 500, item }],
        snapshot: initial.with(500, item),
      },
      hooks,
      { snapshotRatio: 1 },
    );

    expect(getKey).toHaveBeenCalledTimes(1);
    expect(state.rows[500]!.value).toBe(item);
    expect(state.revision).toBe(2);
  });

  it("splices rows and keeps the persistent key map synchronized", () => {
    const initial = [
      { id: 1, label: "A" },
      { id: 2, label: "B" },
      { id: 3, label: "C" },
    ];
    const replacement = { id: 4, label: "D" };
    const { state, hooks } = setup(initial);

    applyKeyedListChange(
      state,
      {
        type: "patch",
        baseRevision: 1,
        revision: 2,
        operations: [
          { type: "splice", index: 1, deleteCount: 1, items: [replacement] },
        ],
        snapshot: [initial[0]!, replacement, initial[2]!],
      },
      hooks,
      { snapshotRatio: 1 },
    );

    expect(state.rows.map((row) => row.key)).toEqual([1, 4, 3]);
    expect(state.rowByKey.has(2)).toBe(false);
    expect(state.rowByKey.get(4)).toBe(state.rows[1]);
  });

  it("moves a contiguous range while preserving row identity", () => {
    const initial = [1, 2, 3, 4, 5].map((id) => ({ id, label: String(id) }));
    const { state, hooks, moveRange } = setup(initial);
    const movedRows = state.rows.slice(1, 3);

    applyKeyedListChange(
      state,
      {
        type: "patch",
        baseRevision: 1,
        revision: 2,
        operations: [{ type: "move", from: 1, count: 2, to: 3 }],
        snapshot: [
          initial[0]!,
          initial[3]!,
          initial[4]!,
          ...initial.slice(1, 3),
        ],
      },
      hooks,
    );

    expect(state.rows.map((row) => row.key)).toEqual([1, 4, 5, 2, 3]);
    expect(state.rows.slice(3)).toEqual(movedRows);
    expect(moveRange).toHaveBeenCalledWith(movedRows, hooks.endAnchor);
  });

  it("falls back to snapshot reconciliation on revision mismatch", () => {
    const initial = [1, 2, 3].map((id) => ({ id, label: String(id) }));
    const snapshot = [...initial].reverse();
    const { state, hooks, getKey } = setup(initial);
    const change: KeyedListChange<Item> = {
      type: "patch",
      baseRevision: 0,
      revision: 3,
      operations: [],
      snapshot,
    };

    applyKeyedListChange(state, change, hooks);

    expect(getKey).toHaveBeenCalledTimes(snapshot.length);
    expect(state.rows.map((row) => row.key)).toEqual([3, 2, 1]);
    expect(state.revision).toBe(3);
  });

  it("rejects an update that changes identity", () => {
    const initial = [{ id: 1, label: "A" }];
    const { state, hooks } = setup(initial);

    expect(() =>
      applyKeyedListChange(
        state,
        {
          type: "patch",
          baseRevision: 1,
          revision: 2,
          operations: [
            { type: "update", index: 0, item: { id: 2, label: "B" } },
          ],
          snapshot: [{ id: 2, label: "B" }],
        },
        hooks,
        { snapshotRatio: 1 },
      ),
    ).toThrow("An update cannot change the key");
  });
});
