// Keyed list reconciliation: common prefix/suffix trimming, then a longest
// increasing subsequence over the reused rows to minimise moves (see M. L.
// Fredman, "On computing the length of longest increasing subsequences",
// Discrete Mathematics 11(1), 1975, doi:10.1016/0012-365X(75)90103-X).

export interface KeyedItem<T = unknown> {
  readonly key: PropertyKey;
  value: T;
}

export interface KeyedReconciliationHooks<T, Row extends KeyedItem<T>> {
  endAnchor: Node;
  getKey(item: T, index: number): PropertyKey;
  getStart(row: Row): Node;
  mount(item: T, key: PropertyKey, index: number, before: Node): Row;
  update(row: Row, item: T, index: number): void;
  move(row: Row, before: Node): void;
  remove(row: Row): void;
  /**
   * Optional batch removal of every previous row, used when none of them is
   * reused. Defaults to `remove` for each row.
   */
  clear?(rows: readonly Row[]): void;
  /**
   * Optional batch mount of `items[from..to)` before `before`, writing each
   * row to `out[index]`. Defaults to `mount` for each item.
   */
  mountRange?(
    items: readonly T[],
    keys: readonly PropertyKey[],
    from: number,
    to: number,
    before: Node,
    out: Row[],
  ): void;
}

export interface KeyedReconciliationResult<Row extends KeyedItem = KeyedItem> {
  rows: Row[];
  keys: PropertyKey[];
}

const NewNodeMark = -1;
const LISMark = -2;

export function reconcileKeyedList<T, Row extends KeyedItem<T>>(
  prevRows: readonly Row[],
  nextItemsRaw: readonly T[] | null | undefined,
  hooks: KeyedReconciliationHooks<T, Row>,
): KeyedReconciliationResult<Row> {
  const nextItems = nextItemsRaw ?? [];
  const nextLen = nextItems.length;
  const nextKeys = resolveKeys(nextItems, hooks.getKey);

  if (nextLen === 0) {
    removeAll(prevRows, hooks);

    return {
      rows: [],
      keys: nextKeys,
    };
  }

  const prevLen = prevRows.length;
  if (prevLen === 0) {
    const rows = new Array<Row>(nextLen);
    mountRange(nextItems, nextKeys, 0, nextLen, hooks.endAnchor, rows, hooks);

    return {
      rows,
      keys: nextKeys,
    };
  }

  const result = new Array<Row>(nextLen);
  let prefixEnd = 0;
  const minLen = Math.min(prevLen, nextLen);

  while (
    prefixEnd < minLen &&
    prevRows[prefixEnd]!.key === nextKeys[prefixEnd]
  ) {
    result[prefixEnd] = prevRows[prefixEnd]!;
    prefixEnd++;
  }

  let prevSuffixStart = prevLen;
  let nextSuffixStart = nextLen;

  while (
    prevSuffixStart > prefixEnd &&
    nextSuffixStart > prefixEnd &&
    prevRows[prevSuffixStart - 1]!.key === nextKeys[nextSuffixStart - 1]
  ) {
    prevSuffixStart--;
    nextSuffixStart--;
    const row = prevRows[prevSuffixStart]!;
    hooks.update(row, nextItems[nextSuffixStart]!, nextSuffixStart);
    result[nextSuffixStart] = row;
  }

  const oldStart = prefixEnd;
  const oldEnd = prevSuffixStart;
  const newStart = prefixEnd;
  const newEnd = nextSuffixStart;

  if (oldStart >= oldEnd) {
    const before =
      oldEnd < prevLen ? hooks.getStart(prevRows[oldEnd]!) : hooks.endAnchor;

    mountRange(nextItems, nextKeys, newStart, newEnd, before, result, hooks);

    return {
      rows: applyPrefixUpdates(result, prevRows, nextItems, prefixEnd, hooks),
      keys: nextKeys,
    };
  }

  if (newStart >= newEnd) {
    for (let i = oldStart; i < oldEnd; i++) {
      hooks.remove(prevRows[i]!);
    }

    return {
      rows: applyPrefixUpdates(result, prevRows, nextItems, prefixEnd, hooks),
      keys: nextKeys,
    };
  }

  const middleLen = newEnd - newStart;
  const sources = new Array<number>(middleLen).fill(NewNodeMark);
  const keyIndex = new Map<PropertyKey, number>();

  for (let i = newStart; i < newEnd; i++) {
    keyIndex.set(nextKeys[i]!, i);
  }

  // Whole-list replacement without reused keys: remove and mount in batches.
  if (oldStart === 0 && oldEnd === prevLen && newEnd - newStart === nextLen) {
    let reused = false;

    for (let oldIndex = 0; oldIndex < prevLen; oldIndex++) {
      if (keyIndex.has(prevRows[oldIndex]!.key)) {
        reused = true;
        break;
      }
    }

    if (!reused) {
      removeAll(prevRows, hooks);
      mountRange(nextItems, nextKeys, 0, nextLen, hooks.endAnchor, result, hooks);

      return {
        rows: result,
        keys: nextKeys,
      };
    }
  }

  let maxNewIndex = newStart - 1;
  let needsRearrange = false;

  for (let oldIndex = oldStart; oldIndex < oldEnd; oldIndex++) {
    const row = prevRows[oldIndex]!;
    const newIndex = keyIndex.get(row.key);

    if (newIndex === undefined) {
      hooks.remove(row);
      continue;
    }

    sources[newIndex - newStart] = oldIndex;
    result[newIndex] = row;

    if (newIndex < maxNewIndex) {
      needsRearrange = true;
    } else {
      maxNewIndex = newIndex;
    }
  }

  if (needsRearrange) {
    markLIS(sources);
  }

  let cursor =
    oldEnd < prevLen ? hooks.getStart(prevRows[oldEnd]!) : hooks.endAnchor;

  for (let j = middleLen - 1; j >= 0; j--) {
    const newIndex = newStart + j;
    const src = sources[j]!;

    if (src === NewNodeMark) {
      const row = hooks.mount(
        nextItems[newIndex]!,
        nextKeys[newIndex]!,
        newIndex,
        cursor,
      );
      cursor = hooks.getStart(row);
      result[newIndex] = row;
      continue;
    }

    const row = result[newIndex]!;
    hooks.update(row, nextItems[newIndex]!, newIndex);

    if (needsRearrange && src !== LISMark) {
      hooks.move(row, cursor);
    }

    cursor = hooks.getStart(row);
  }

  return {
    rows: applyPrefixUpdates(result, prevRows, nextItems, prefixEnd, hooks),
    keys: nextKeys,
  };
}

function removeAll<T, Row extends KeyedItem<T>>(
  rows: readonly Row[],
  hooks: KeyedReconciliationHooks<T, Row>,
): void {
  if (hooks.clear !== undefined) {
    hooks.clear(rows);
    return;
  }

  for (let i = 0; i < rows.length; i++) {
    hooks.remove(rows[i]!);
  }
}

function mountRange<T, Row extends KeyedItem<T>>(
  items: readonly T[],
  keys: readonly PropertyKey[],
  from: number,
  to: number,
  before: Node,
  out: Row[],
  hooks: KeyedReconciliationHooks<T, Row>,
): void {
  if (hooks.mountRange !== undefined) {
    hooks.mountRange(items, keys, from, to, before, out);
    return;
  }

  for (let i = from; i < to; i++) {
    out[i] = hooks.mount(items[i]!, keys[i]!, i, before);
  }
}

function resolveKeys<T>(
  nextItems: readonly T[],
  getKey: (item: T, index: number) => PropertyKey,
): PropertyKey[] {
  const keys = new Array<PropertyKey>(nextItems.length);

  for (let i = 0; i < nextItems.length; i++) {
    keys[i] = getKey(nextItems[i]!, i);
  }

  if (__DEV__) {
    assertUniqueKeys(keys);
  }

  return keys;
}

function assertUniqueKeys(keys: readonly PropertyKey[]): void {
  const seen = new Set<PropertyKey>();

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;

    if (seen.has(key)) {
      throw new Error(`Duplicate key in <For>: ${String(key)}`);
    }

    seen.add(key);
  }
}

function applyPrefixUpdates<T, Row extends KeyedItem<T>>(
  result: Row[],
  prevRows: readonly Row[],
  nextItems: readonly T[],
  prefixEnd: number,
  hooks: Pick<KeyedReconciliationHooks<T, Row>, "update">,
): Row[] {
  for (let i = prefixEnd - 1; i >= 0; i--) {
    hooks.update(prevRows[i]!, nextItems[i]!, i);
  }

  return result;
}

function markLIS(values: number[]): void {
  const len = values.length;
  const parent = new Array<number>(len);
  const index = new Array<number>(len);
  let lisLen = 0;
  let i = 0;

  for (; values[i] === NewNodeMark; ++i) {
    // Skip new nodes when seeding the LIS tails.
  }

  index[0] = i++;

  for (; i < len; i++) {
    const current = values[i]!;
    if (current === NewNodeMark) continue;

    const tailIndex = index[lisLen]!;

    if (values[tailIndex]! < current) {
      parent[i] = tailIndex;
      index[++lisLen] = i;
      continue;
    }

    let lo = 0;
    let hi = lisLen;

    while (lo < hi) {
      const mid = (lo + hi) >>> 1;

      if (values[index[mid]!]! < current) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (current < values[index[lo]!]!) {
      if (lo > 0) {
        parent[i] = index[lo - 1]!;
      }

      index[lo] = i;
    }
  }

  let current = index[lisLen]!;

  for (let remaining = lisLen; remaining >= 0; remaining--) {
    values[current] = LISMark;
    current = parent[current]!;
  }
}
