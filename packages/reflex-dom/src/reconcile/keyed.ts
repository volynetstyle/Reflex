export interface KeyedItem<T = unknown> {
  key: PropertyKey;
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
}

export interface KeyedReconciliationResult<Row> {
  rows: Row[];
  keys: PropertyKey[];
}

const NewNodeMark = -1;
const LISMark = -2;
const RearrangeNodes = 1073741823;

export function reconcileKeyedList<T, Row extends KeyedItem<T>>(
  prevRows: readonly Row[],
  nextItemsRaw: readonly T[] | null | undefined,
  hooks: KeyedReconciliationHooks<T, Row>,
): KeyedReconciliationResult<Row> {
  const nextItems = nextItemsRaw ?? [];
  const nextLen = nextItems.length;
  const nextKeys = resolveKeys(nextItems, hooks.getKey);

  if (nextLen === 0) {
    for (let i = 0; i < prevRows.length; i++) {
      hooks.remove(prevRows[i]!);
    }

    return {
      rows: [],
      keys: nextKeys,
    };
  }

  const prevLen = prevRows.length;
  if (prevLen === 0) {
    const rows = new Array<Row>(nextLen);

    for (let i = 0; i < nextLen; i++) {
      rows[i] = hooks.mount(nextItems[i]!, nextKeys[i]!, i, hooks.endAnchor);
    }

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

    for (let i = newStart; i < newEnd; i++) {
      result[i] = hooks.mount(nextItems[i]!, nextKeys[i]!, i, before);
    }

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

  let lastOldPos = 0;

  for (let i = oldStart; i < oldEnd; i++) {
    const row = prevRows[i]!;
    const newPos = keyIndex.get(row.key);

    if (newPos !== undefined) {
      keyIndex.delete(row.key);
      sources[newPos - newStart] = i;

      if (newPos < lastOldPos) {
        lastOldPos = RearrangeNodes;
      } else if (lastOldPos !== RearrangeNodes) {
        lastOldPos = newPos;
      }

      result[newPos] = row;
    } else {
      hooks.remove(row);
    }
  }

  const needsRearrange = lastOldPos === RearrangeNodes;
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

function resolveKeys<T>(
  nextItems: readonly T[],
  getKey: (item: T, index: number) => PropertyKey,
): PropertyKey[] {
  const keys = new Array<PropertyKey>(nextItems.length);
  const seenKeys = new Set<PropertyKey>();

  for (let i = 0; i < nextItems.length; i++) {
    const key = getKey(nextItems[i]!, i);

    if (seenKeys.has(key)) {
      throw new Error(`Duplicate key in <For>: ${String(key)}`);
    }

    seenKeys.add(key);
    keys[i] = key;
  }

  return keys;
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

function markLIS(values: Array<number>): void {
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
