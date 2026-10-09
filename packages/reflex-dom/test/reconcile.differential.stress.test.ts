import { describe, expect, it } from "vitest";
import {
  applyKeyedListChange,
  createKeyedListState,
  type DeltaKeyedHooks,
  type KeyedListOperation,
} from "../src/reconcile/keyed-delta";
import { reconcileKeyedList, type KeyedItem } from "../src/reconcile/keyed";

interface Item {
  id: number;
  label: string;
}

interface Row extends KeyedItem<Item> {
  index: number;
  element: HTMLLIElement;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function createDOMHarness() {
  const list = document.createElement("ul");
  const endAnchor = document.createComment("end");
  list.append(endAnchor);
  const hooks: DeltaKeyedHooks<Item, Row> = {
    endAnchor,
    getKey: (item) => item.id,
    getStart: (row) => row.element,
    mount(item, key, index, before) {
      const element = document.createElement("li");
      element.dataset.id = String(key);
      element.textContent = item.label;
      list.insertBefore(element, before);
      return { key, value: item, index, element };
    },
    update(row, item, index) {
      row.value = item;
      row.index = index;
      row.element.textContent = item.label;
    },
    updateIndex(row, index) {
      row.index = index;
    },
    move(row, before) {
      list.insertBefore(row.element, before);
    },
    moveRange(rows, before) {
      const fragment = document.createDocumentFragment();
      for (const row of rows) fragment.append(row.element);
      list.insertBefore(fragment, before);
    },
    remove(row) {
      row.element.remove();
    },
  };
  return { list, hooks };
}

function nextOperation(
  items: Item[],
  next: () => number,
  freshId: () => number,
): KeyedListOperation<Item> {
  const choice = items.length === 0 ? 0 : next() % 3;
  if (choice === 0) {
    const index = next() % (items.length + 1);
    const deleteCount = Math.min(next() % 4, items.length - index);
    const insertCount = items.length > 80 ? 0 : next() % 4;
    const inserted = Array.from({ length: insertCount }, () => {
      const id = freshId();
      return { id, label: `item-${id}` };
    });
    items.splice(index, deleteCount, ...inserted);
    return { type: "splice", index, deleteCount, items: inserted };
  }
  if (choice === 1) {
    const from = next() % items.length;
    const count = 1 + (next() % Math.min(5, items.length - from));
    const to = next() % (items.length - count + 1);
    const moved = items.splice(from, count);
    items.splice(to, 0, ...moved);
    return { type: "move", from, count, to };
  }
  const index = next() % items.length;
  const previous = items[index]!;
  const item = { id: previous.id, label: `changed-${next()}` };
  items[index] = item;
  return { type: "update", index, item };
}

describe("keyed reconciliation differential stress", () => {
  it.each([0x12345678, 0x9e3779b9, 0xdeadbeef])(
    "matches snapshot reconciliation and a list model for seed %i",
    (seed) => {
      const next = random(seed);
      const deltaDOM = createDOMHarness();
      const snapshotDOM = createDOMHarness();
      const state = createKeyedListState<Item, Row>([], []);
      let snapshotRows: Row[] = [];
      let items: Item[] = [];
      let revision = 0;
      let id = 0;

      for (let step = 0; step < 240; step++) {
        const beforeDelta = new Map(state.rows.map((row) => [row.key, row.element]));
        const beforeSnapshot = new Map(snapshotRows.map((row) => [row.key, row.element]));
        const operations: KeyedListOperation<Item>[] = [];
        const nextItems = items.slice();
        const count = 1 + (next() % 3);
        for (let index = 0; index < count; index++) {
          operations.push(nextOperation(nextItems, next, () => ++id));
        }
        const context = `seed=${seed} step=${step} operations=${JSON.stringify(operations)}`;
        const nextRevision = ++revision;
        if (step % 17 === 0) {
          applyKeyedListChange(
            state,
            { type: "snapshot", revision: nextRevision, snapshot: nextItems },
            deltaDOM.hooks,
          );
        } else {
          applyKeyedListChange(
            state,
            {
              type: "patch",
              baseRevision: step % 19 === 0 ? revision - 2 : revision - 1,
              revision: nextRevision,
              operations,
              snapshot: nextItems,
            },
            deltaDOM.hooks,
            { maxOperations: Infinity, snapshotRatio: Infinity },
          );
        }
        snapshotRows = reconcileKeyedList(
          snapshotRows,
          nextItems,
          snapshotDOM.hooks,
        ).rows;
        items = nextItems;

        const expected = items.map((item) => [String(item.id), item.label]);
        const actual = (list: HTMLUListElement) =>
          Array.from(list.children, (element) => [
            (element as HTMLElement).dataset.id,
            element.textContent,
          ]);
        expect(actual(deltaDOM.list), context).toEqual(expected);
        expect(actual(snapshotDOM.list), context).toEqual(expected);
        expect(state.rows.map((row) => row.key), context).toEqual(items.map((item) => item.id));
        expect(state.items, context).toEqual(items);
        expect(state.revision, context).toBe(revision);
        expect(state.rowByKey.size, context).toBe(items.length);
        for (let index = 0; index < items.length; index++) {
          const item = items[index]!;
          const row = state.rows[index]!;
          expect(row.index, context).toBe(index);
          expect(state.rowByKey.get(item.id), context).toBe(row);
          if (beforeDelta.has(item.id)) {
            expect(row.element, context).toBe(beforeDelta.get(item.id));
          }
          if (beforeSnapshot.has(item.id)) {
            expect(snapshotRows[index]!.element, context).toBe(beforeSnapshot.get(item.id));
          }
        }
      }
    },
  );
});
