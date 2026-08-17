import { bench, describe } from "vitest";
import {
  reconcileKeyedList,
  type KeyedItem,
  type KeyedReconciliationHooks,
} from "../src/reconcile/keyed";
import {
  applyKeyedListChange,
  createKeyedListState,
  type KeyedListChange,
  type KeyedListOperation,
  type KeyedListState,
} from "../src/reconcile/keyed-delta";

const Sizes = [16, 128, 1_024, 8_192] as const;
const benchOptions = { time: 300, warmupTime: 100 };
const anchor = {} as Node;

interface Item {
  id: number;
  value: number;
}

interface Row extends KeyedItem<Item> {
  index: number;
  start: Node;
}

const hooks: KeyedReconciliationHooks<Item, Row> = {
  endAnchor: anchor,
  getKey: (item) => item.id,
  getStart: (row) => row.start,
  mount: (item, key, index) => ({ key, value: item, index, start: anchor }),
  update: (row, item, index) => {
    row.value = item;
    row.index = index;
  },
  move: () => {},
  remove: () => {},
};

interface Scenario {
  name: string;
  before: readonly Item[];
  after: readonly Item[];
  forward: KeyedListChange<Item>;
  backward: KeyedListChange<Item>;
}

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

function patch(
  baseRevision: number,
  revision: number,
  snapshot: readonly Item[],
  operations: readonly KeyedListOperation<Item>[],
): KeyedListChange<Item> {
  return { type: "patch", baseRevision, revision, snapshot, operations };
}

function updateScenario(length: number): Scenario {
  const before = makeItems(length);
  const index = length >>> 1;
  const after = before.slice();
  after[index] = { id: before[index]!.id, value: -1 };
  return {
    name: `update one / ${length}`,
    before,
    after,
    forward: patch(0, 1, after, [
      { type: "update", index, item: after[index]! },
    ]),
    backward: patch(1, 0, before, [
      { type: "update", index, item: before[index]! },
    ]),
  };
}

function appendScenario(length: number): Scenario {
  const before = makeItems(length);
  const inserted = [{ id: length, value: length }];
  const after = before.concat(inserted);
  return {
    name: `append/remove one / ${length}`,
    before,
    after,
    forward: patch(0, 1, after, [
      { type: "splice", index: length, deleteCount: 0, items: inserted },
    ]),
    backward: patch(1, 0, before, [
      { type: "splice", index: length, deleteCount: 1, items: [] },
    ]),
  };
}

function moveRangeScenario(length: number): Scenario {
  const before = makeItems(length);
  const count = Math.max(1, Math.min(64, length >>> 3));
  const after = before.slice(count).concat(before.slice(0, count));
  return {
    name: `move range ${count} / ${length}`,
    before,
    after,
    forward: patch(0, 1, after, [
      { type: "move", from: 0, count, to: length - count },
    ]),
    backward: patch(1, 0, before, [
      { type: "move", from: length - count, count, to: 0 },
    ]),
  };
}

function shuffleScenario(length: number): Scenario {
  const before = makeItems(length);
  const after = before.slice();
  let seed = 0x1234_5678;
  for (let i = length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    const j = seed % (i + 1);
    [after[i], after[j]] = [after[j]!, after[i]!];
  }
  return {
    name: `shuffle fallback / ${length}`,
    before,
    after,
    forward: { type: "snapshot", revision: 1, snapshot: after },
    backward: { type: "snapshot", revision: 0, snapshot: before },
  };
}

function verifyRows(rows: readonly Row[], expected: readonly Item[]): void {
  if (
    rows.length !== expected.length ||
    rows.some(
      (row, index) =>
        row.key !== expected[index]!.id ||
        row.value !== expected[index] ||
        row.index !== index,
    )
  ) {
    throw new Error("reconciliation produced stale rows");
  }
}

function comparePlanner(scenario: Scenario): void {
  describe(`${scenario.name} | planner`, () => {
    let keyedRows = createRows(scenario.before);
    bench(
      "keyed snapshot cycle",
      () => {
        keyedRows = reconcileKeyedList(keyedRows, scenario.after, hooks).rows;
        keyedRows = reconcileKeyedList(keyedRows, scenario.before, hooks).rows;
      },
      {
        ...benchOptions,
        teardown: () => verifyRows(keyedRows, scenario.before),
      },
    );

    const deltaState: KeyedListState<Item, Row> = createKeyedListState(
      scenario.before,
      createRows(scenario.before),
    );
    bench(
      "keyed delta cycle",
      () => {
        applyKeyedListChange(deltaState, scenario.forward, hooks);
        applyKeyedListChange(deltaState, scenario.backward, hooks);
      },
      {
        ...benchOptions,
        teardown: () => verifyRows(deltaState.rows, scenario.before),
      },
    );
  });
}

for (const size of Sizes) {
  comparePlanner(updateScenario(size));
  comparePlanner(appendScenario(size));
  comparePlanner(moveRangeScenario(size));
  comparePlanner(shuffleScenario(size));
}

describe("immutable source + planner | 8192 rows", () => {
  const length = 8_192;
  const index = length >>> 1;
  const initial = makeItems(length);
  let keyedItems = initial;
  let keyedRows = createRows(initial);
  let deltaItems = initial;
  const deltaState = createKeyedListState(initial, createRows(initial));

  bench(
    "keyed snapshot | produce + update cycle",
    () => {
      const previous = keyedItems[index]!;
      keyedItems = keyedItems.with(index, { id: previous.id, value: -1 });
      keyedRows = reconcileKeyedList(keyedRows, keyedItems, hooks).rows;
      keyedItems = keyedItems.with(index, previous);
      keyedRows = reconcileKeyedList(keyedRows, keyedItems, hooks).rows;
    },
    benchOptions,
  );

  bench(
    "keyed delta | produce + update cycle",
    () => {
      const previous = deltaItems[index]!;
      deltaItems = deltaItems.with(index, { id: previous.id, value: -1 });
      applyKeyedListChange(
        deltaState,
        patch(0, 1, deltaItems, [
          { type: "update", index, item: deltaItems[index]! },
        ]),
        hooks,
      );
      deltaItems = deltaItems.with(index, previous);
      applyKeyedListChange(
        deltaState,
        patch(1, 0, deltaItems, [{ type: "update", index, item: previous }]),
        hooks,
      );
    },
    benchOptions,
  );
});
