//https://pdf.sciencedirectassets.com/271536/1-s2.0-S0012365X00X03780/1-s2.0-0012365X7590103X/main.pdf?X-Amz-Security-Token=IQoJb3JpZ2luX2VjENz%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJGMEQCIAgBHba9mrRxFXk7d9KsJOhKKwiVpHeMT9QFo0I0PaTeAiBKXBTYtg73UkGWUaveMJqMCQLr6fyl1zoAYR459W%2BLdCq8BQil%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAUaDDA1OTAwMzU0Njg2NSIMo2rFg5gs2jQKjrcDKpAFc5XUabfEL3FO7vCfl%2FnkJ95%2B5PW8xjPd3mbtoQ5bJ0dPTz7jBKKDEfhpiP28tHYb0DhefsjMtR%2B7XoPdZ1Kh4PhU6a%2BZ6SAkdZUrEuMc2ATPNMKRd%2F0FNUDlAwmcsa30Hq3ok58cyPpSjnecE5Favyrs4n4MnVCHm6JoxoQ584ML4ceogMxF8Ox%2B%2Bnp%2Be9p4L8FSlFwwGaRt%2BiLy8H9H5SLiQEaoVPs4AftMogbRCJhwyRVEl5QjcLs36yYnsbnqfJWUeIUiMPaODRiHyVMgR7NLdulx5H%2Fm9vMBHGBRZxiegbZ4cm%2BSY%2BhGYHMFydGKbLYKLwAxiwzW%2FLlMMKL2m6%2BO%2B8LdErLFFaQG63eDj3JRD9%2BIVHXX%2Bqax6ZB52vu9uL8ZZGTFDg77zuMGr7%2FKf99AvQlSFvPQWYkGTt8SJyfbJn8HLuaGlzVXwF5uTH696U2wqngs9kT8eudQRALnfVUrWPJoyDy9LfcvTSQbsMEMye0xrCwWnfeURhCjfWW%2B0jexyG7Vy3u4YBbfus7WhOYRoehrgTOg1ghSJTGYCj8OGahcg3IDpABvhpTS3MlA4pXs7x0P8Nqwvlrk8nZpMS14eQ%2B%2FyXjBI0%2FeveidYeVu8PiHiaWCpSr5v%2FR3DJ7PFBYcmtwwz2T1E3bfQGwsTiboTp6DvqIRuJt2rot4ZEWU52w8tgbv0GZhMbmwvEtBF%2B%2FVcIH3trLGYfS7dICWW45CNG68K1O0JsLU4ZecHOJ6Kl3CiLq7q3Np27Hu2V1hbTqri0RVpW78pY0O8xcRyJs7x1tEQO3n%2FDXkDT0DFfsPLzZ3%2BMj7pwHCvRA72RKAUxwx2mwJ11TQnSgjP%2BvHskPL%2FD2u5ZcR7FPJrM9lb88wi9no0wY6sgGEfAR2el%2FEFbtC%2BXqCFIxN1damv0koCUdhM65kOMtTQzoV0PVozI31EmT101ibNoYTlzytydmx7iN2C67GfO0HmqWkcKtPjgyk7OYhCfuoOMkisq1T6FmmToXCtXV5Qv%2FDX6ztovbufFu6emfooTh2C6IjpgcVyMtbSpz82%2BnD%2FCkao%2BUOLiSPOduvacrlG38%2BFVgo%2FMIxtvnwdLn1XOWSc%2FMweXXqKq5eqMr2RaXoYguj&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260810T204727Z&X-Amz-SignedHeaders=host&X-Amz-Expires=300&X-Amz-Credential=ASIAQ3PHCVTY4Z4J2CF6%2F20260810%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=a9575f05d6e711606a9a8b86725ce4bb9f84d348c30f22914592351d3d1a7679&hash=dfa49e9452895e98f2fdc11a0e4e730835dccd51829f540e0c070addacd8fa2d&host=68042c943591013ac2b2430a89b270f6af2c76d8dfd086a07176afe7c76c2c61&pii=0012365X7590103X&tid=spdf-b366e76d-64a7-431c-92d0-3bea7a1bfa42&sid=a1e6f6d97dbec24d0a197d329746336c6dc3gxrqa&type=client&tsoh=d3d3LnNjaWVuY2VkaXJlY3QuY29t&rh=d3d3LnNjaWVuY2VkaXJlY3QuY29t&ua=130f05575e57010c5051&rr=a291db1448d5d582&cc=ua

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
