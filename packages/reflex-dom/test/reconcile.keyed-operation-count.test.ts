import { describe, expect, it } from "vitest";
import { reconcileKeyedList, type KeyedItem } from "../src/reconcile/keyed";
import {
  applyKeyedListChange,
  createKeyedListState,
  type DeltaKeyedHooks,
} from "../src/reconcile/keyed-delta";

interface Item {
  id: number;
  value: number;
}

interface Row extends KeyedItem<Item> {
  index: number;
  start: Node;
}

interface Counts {
  getKey: number;
  getStart: number;
  mount: number;
  update: number;
  updateIndex: number;
  move: number;
  moveRange: number;
  remove: number;
}

const anchor = {} as Node;

function makeItems(length: number): Item[] {
  return Array.from({ length }, (_, id) => ({ id, value: id }));
}

function createRows(items: readonly Item[]): Row[] {
  return items.map((item, index) => ({
    key: item.id,
    value: item,
    index,
    start: anchor,
  }));
}

function createCountingHooks() {
  const counts: Counts = {
    getKey: 0,
    getStart: 0,
    mount: 0,
    update: 0,
    updateIndex: 0,
    move: 0,
    moveRange: 0,
    remove: 0,
  };
  const hooks: DeltaKeyedHooks<Item, Row> = {
    endAnchor: anchor,
    getKey(item) {
      counts.getKey++;
      return item.id;
    },
    getStart(row) {
      counts.getStart++;
      return row.start;
    },
    mount(item, key, index) {
      counts.mount++;
      return { key, value: item, index, start: anchor };
    },
    update(row, item, index) {
      counts.update++;
      row.value = item;
      row.index = index;
    },
    updateIndex(row, index) {
      counts.updateIndex++;
      row.index = index;
    },
    move() {
      counts.move++;
    },
    moveRange() {
      counts.moveRange++;
    },
    remove() {
      counts.remove++;
    },
  };
  return { counts, hooks };
}

describe("keyed reconciliation operation taxonomy", () => {
  it("update one avoids the snapshot-wide key and update passes", () => {
    const before = makeItems(1_024);
    const index = before.length >>> 1;
    const item = { id: index, value: -1 };
    const after = before.with(index, item);

    const keyed = createCountingHooks();
    const keyedRows = reconcileKeyedList(
      createRows(before),
      after,
      keyed.hooks,
    ).rows;
    expect(keyed.counts.getKey).toBe(before.length);
    expect(keyed.counts.update).toBe(before.length);

    const delta = createCountingHooks();
    const state = createKeyedListState(before, createRows(before));
    const originalRow = state.rows[index];
    applyKeyedListChange(
      state,
      {
        type: "patch",
        baseRevision: 0,
        revision: 1,
        operations: [{ type: "update", index, item }],
        snapshot: after,
      },
      delta.hooks,
    );

    expect(delta.counts.getKey).toBe(1);
    expect(delta.counts.update).toBe(1);
    expect(delta.counts.mount).toBe(0);
    expect(delta.counts.remove).toBe(0);
    expect(state.rows[index]).toBe(originalRow);
    expect(state.rows[index]!.value).toBe(item);
    expect(keyedRows[index]!.value).toBe(item);
  });

  it("range move preserves identity and uses one logical range operation", () => {
    const before = makeItems(1_024);
    const count = 64;
    const after = before.slice(count).concat(before.slice(0, count));
    const delta = createCountingHooks();
    const state = createKeyedListState(before, createRows(before));
    const originalByKey = new Map(state.rows.map((row) => [row.key, row]));

    applyKeyedListChange(
      state,
      {
        type: "patch",
        baseRevision: 0,
        revision: 1,
        operations: [
          { type: "move", from: 0, count, to: before.length - count },
        ],
        snapshot: after,
      },
      delta.hooks,
    );

    expect(delta.counts.moveRange).toBe(1);
    expect(delta.counts.move).toBe(0);
    expect(delta.counts.mount).toBe(0);
    expect(delta.counts.remove).toBe(0);
    expect(delta.counts.updateIndex).toBe(before.length);
    expect(state.rows.map((row) => row.key)).toEqual(
      after.map((item) => item.id),
    );
    for (const row of state.rows) {
      expect(row).toBe(originalByKey.get(row.key));
      expect(row.index).toBe(state.rows.indexOf(row));
    }
  });
});
