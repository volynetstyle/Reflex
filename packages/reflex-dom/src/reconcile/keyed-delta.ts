import {
  reconcileKeyedList,
  type KeyedItem,
  type KeyedReconciliationHooks,
} from "./keyed";

export type KeyedListOperation<T> =
  | {
      readonly type: "splice";
      readonly index: number;
      readonly deleteCount: number;
      readonly items: readonly T[];
    }
  | {
      readonly type: "move";
      readonly from: number;
      readonly count: number;
      /** Index after the moved range has been extracted. */
      readonly to: number;
    }
  | {
      readonly type: "update";
      readonly index: number;
      readonly item: T;
    };

export interface KeyedListPatch<T> {
  readonly baseRevision: number;
  readonly revision: number;
  readonly operations: readonly KeyedListOperation<T>[];
  readonly snapshot: readonly T[];
}

export type KeyedListChange<T> =
  | ({ readonly type: "patch" } & KeyedListPatch<T>)
  | {
      readonly type: "snapshot";
      readonly revision: number;
      readonly snapshot: readonly T[];
    };

export interface KeyedListState<T, Row extends KeyedItem<T>> {
  revision: number;
  items: T[];
  rows: Row[];
  rowByKey: Map<PropertyKey, Row>;
}

export interface DeltaKeyedHooks<
  T,
  Row extends KeyedItem<T>,
> extends KeyedReconciliationHooks<T, Row> {
  moveRange?(rows: readonly Row[], before: Node): void;
  updateIndex?(row: Row, index: number): void;
}

export interface KeyedPatchOptions {
  maxOperations?: number;
  snapshotRatio?: number;
}

export function createKeyedListState<T, Row extends KeyedItem<T>>(
  items: readonly T[],
  rows: readonly Row[],
  revision = 0,
): KeyedListState<T, Row> {
  return {
    revision,
    items: items.slice(),
    rows: rows.slice(),
    rowByKey: rebuildRowMap(rows),
  };
}

export function applyKeyedListChange<T, Row extends KeyedItem<T>>(
  state: KeyedListState<T, Row>,
  change: KeyedListChange<T>,
  hooks: DeltaKeyedHooks<T, Row>,
  options?: KeyedPatchOptions,
): void {
  if (
    change.type === "snapshot" ||
    change.baseRevision !== state.revision ||
    shouldUseSnapshot(change, state.rows.length, options)
  ) {
    applySnapshot(state, change.snapshot, change.revision, hooks);
    return;
  }

  for (let i = 0; i < change.operations.length; i++) {
    const operation = change.operations[i]!;

    switch (operation.type) {
      case "splice":
        applySplice(state, operation, hooks);
        break;
      case "move":
        applyMove(state, operation, hooks);
        break;
      case "update":
        applyUpdate(state, operation, hooks);
        break;
    }
  }

  state.revision = change.revision;
}

export function shouldUseSnapshot<T>(
  patch: KeyedListPatch<T>,
  length: number,
  options?: KeyedPatchOptions,
): boolean {
  const maxOperations = options?.maxOperations ?? 64;
  const snapshotRatio = options?.snapshotRatio ?? 0.25;
  return (
    patch.operations.length > maxOperations ||
    patch.operations.length > length * snapshotRatio
  );
}

function applyUpdate<T, Row extends KeyedItem<T>>(
  state: KeyedListState<T, Row>,
  operation: Extract<KeyedListOperation<T>, { type: "update" }>,
  hooks: DeltaKeyedHooks<T, Row>,
): void {
  const { index, item } = operation;
  if (index < 0 || index >= state.rows.length) {
    throw new RangeError(`Invalid update index: ${index}`);
  }

  const row = state.rows[index]!;
  const nextKey = hooks.getKey(item, index);
  if (!sameKey(row.key, nextKey)) {
    throw new Error(
      "An update cannot change the key; use splice or snapshot reconciliation",
    );
  }

  state.items[index] = item;
  hooks.update(row, item, index);
}

function applySplice<T, Row extends KeyedItem<T>>(
  state: KeyedListState<T, Row>,
  operation: Extract<KeyedListOperation<T>, { type: "splice" }>,
  hooks: DeltaKeyedHooks<T, Row>,
): void {
  const { index, deleteCount, items } = operation;
  const oldLength = state.rows.length;
  if (
    index < 0 ||
    index > oldLength ||
    deleteCount < 0 ||
    index + deleteCount > oldLength
  ) {
    throw new RangeError(
      `Invalid splice: index=${index}, deleteCount=${deleteCount}`,
    );
  }

  const insertedKeys = resolveInsertedKeys(items, index, hooks.getKey);
  const removedRows = state.rows.slice(index, index + deleteCount);
  validateSpliceKeys(state.rowByKey, removedRows, insertedKeys);

  state.rows.splice(index, deleteCount);
  state.items.splice(index, deleteCount);

  for (let i = 0; i < removedRows.length; i++) {
    const row = removedRows[i]!;
    state.rowByKey.delete(row.key);
    hooks.remove(row);
  }

  const anchor =
    index < state.rows.length
      ? hooks.getStart(state.rows[index]!)
      : hooks.endAnchor;
  const mountedRows = new Array<Row>(items.length);
  for (let i = 0; i < items.length; i++) {
    const itemIndex = index + i;
    const key = insertedKeys[i]!;
    const row = hooks.mount(items[i]!, key, itemIndex, anchor);
    mountedRows[i] = row;
    state.rowByKey.set(key, row);
  }

  state.rows.splice(index, 0, ...mountedRows);
  state.items.splice(index, 0, ...items);
  updateIndexRange(state, index + mountedRows.length, state.rows.length, hooks);
}

function applyMove<T, Row extends KeyedItem<T>>(
  state: KeyedListState<T, Row>,
  operation: Extract<KeyedListOperation<T>, { type: "move" }>,
  hooks: DeltaKeyedHooks<T, Row>,
): void {
  const { from, count, to } = operation;
  const length = state.rows.length;
  if (
    from < 0 ||
    count < 0 ||
    from + count > length ||
    to < 0 ||
    to > length - count
  ) {
    throw new RangeError(
      `Invalid move: from=${from}, count=${count}, to=${to}`,
    );
  }
  if (count === 0 || from === to) return;

  const movedRows = state.rows.splice(from, count);
  const movedItems = state.items.splice(from, count);
  const anchor =
    to < state.rows.length ? hooks.getStart(state.rows[to]!) : hooks.endAnchor;

  if (hooks.moveRange !== undefined) {
    hooks.moveRange(movedRows, anchor);
  } else {
    for (let i = 0; i < movedRows.length; i++) {
      hooks.move(movedRows[i]!, anchor);
    }
  }

  state.rows.splice(to, 0, ...movedRows);
  state.items.splice(to, 0, ...movedItems);
  updateIndexRange(
    state,
    Math.min(from, to),
    Math.min(length, Math.max(from + count, to + count)),
    hooks,
  );
}

function applySnapshot<T, Row extends KeyedItem<T>>(
  state: KeyedListState<T, Row>,
  snapshot: readonly T[],
  revision: number,
  hooks: DeltaKeyedHooks<T, Row>,
): void {
  const result = reconcileKeyedList(state.rows, snapshot, hooks);
  state.items = snapshot.slice();
  state.rows = result.rows;
  state.rowByKey = rebuildRowMap(result.rows);
  state.revision = revision;
}

function updateIndexRange<T, Row extends KeyedItem<T>>(
  state: KeyedListState<T, Row>,
  start: number,
  end: number,
  hooks: DeltaKeyedHooks<T, Row>,
): void {
  for (let index = start; index < end; index++) {
    const row = state.rows[index]!;
    if (hooks.updateIndex !== undefined) {
      hooks.updateIndex(row, index);
    } else {
      hooks.update(row, state.items[index]!, index);
    }
  }
}

function resolveInsertedKeys<T>(
  items: readonly T[],
  startIndex: number,
  getKey: (item: T, index: number) => PropertyKey,
): PropertyKey[] {
  const keys = new Array<PropertyKey>(items.length);
  for (let i = 0; i < items.length; i++) {
    keys[i] = getKey(items[i]!, startIndex + i);
  }
  return keys;
}

function validateSpliceKeys<Row extends KeyedItem>(
  rowByKey: ReadonlyMap<PropertyKey, Row>,
  removedRows: readonly Row[],
  insertedKeys: readonly PropertyKey[],
): void {
  const removedKeys = new Set<PropertyKey>();
  const inserted = new Set<PropertyKey>();
  for (let i = 0; i < removedRows.length; i++) {
    removedKeys.add(removedRows[i]!.key);
  }
  for (let i = 0; i < insertedKeys.length; i++) {
    const key = insertedKeys[i]!;
    if (inserted.has(key)) {
      throw new Error(`Duplicate inserted key: ${String(key)}`);
    }
    if (rowByKey.has(key) && !removedKeys.has(key)) {
      throw new Error(`Key already exists: ${String(key)}`);
    }
    inserted.add(key);
  }
}

function rebuildRowMap<Row extends KeyedItem>(
  rows: readonly Row[],
): Map<PropertyKey, Row> {
  const result = new Map<PropertyKey, Row>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (__DEV__ && result.has(row.key)) {
      throw new Error(`Duplicate row key: ${String(row.key)}`);
    }
    result.set(row.key, row);
  }
  return result;
}

function sameKey(a: PropertyKey, b: PropertyKey): boolean {
  return a === b || (a !== a && b !== b);
}
