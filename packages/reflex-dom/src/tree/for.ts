import type { Namespace } from "../host/namespace";
import type { ForRenderable } from "../operators";
import type { DOMRenderer } from "../runtime";
import type { ContentSlot } from "../structure/content-slot";
import { onEffectStart, ownedEffect, registerCleanup } from "../ownership";
import { moveRangeBefore } from "../host/mutations";

type CreateMountedSlot = (
  renderer: DOMRenderer,
  value: unknown,
  ns: Namespace,
) => ContentSlot;

interface ForRow<T> {
  key: PropertyKey;
  value: T;
  slot: ContentSlot;
}

/**
 * Magic values stored directly inside the `sources` Array.
 * Using negative sentinels means we never need a separate Set or boolean —
 * one array carries all the information needed for step 4.
 *
 * NewNodeMark  (-1) — position is unoccupied; node must be mounted.
 * LISMark      (-2) — position belongs to the longest increasing subsequence;
 *                     node is already in the correct relative order, skip move.
 * RearrangeNodes — max SMI value in V8 (2^30 - 1). Used as a sentinel stored
 *                  in `lastOldPos` to signal that at least one node is out of
 *                  order. Choosing max-SMI means the comparison
 *                  `newPos < lastOldPos` fires immediately on the next node
 *                  without a separate boolean flag.
 */
const NewNodeMark = -1;
const LISMark = -2;
const RearrangeNodes = 1073741823; // Max SMI — compare is a single instruction in V8

export function mountFor(
  renderer: DOMRenderer,
  renderable: ForRenderable<unknown>,
  ns: Namespace,
  createMountedSlot: CreateMountedSlot,
): Node {
  const doc = document;
  const fragment = doc.createDocumentFragment();
  const start = doc.createComment("");
  const end = doc.createComment("");
  fragment.appendChild(start);
  fragment.appendChild(end);

  let rows: ForRow<unknown>[] = [];
  let fallbackSlot: ContentSlot | null = null;

  function destroyRows(currentRows: readonly ForRow<unknown>[]): void {
    for (let i = 0; i < currentRows.length; i++) {
      currentRows[i]!.slot.destroy();
    }
  }

  function destroyFallback(): void {
    fallbackSlot?.destroy();
    fallbackSlot = null;
  }

  function reconcile(
    nextItemsRaw: readonly unknown[] | null | undefined,
  ): void {
    const parent = end.parentNode;
    if (parent === null) return;

    const nextItems = nextItemsRaw ?? [];
    const nextLen = nextItems.length;
    const nextKeys = resolveKeys(nextItems, renderable);

    if (nextLen === 0) {
      destroyRows(rows);
      rows = [];

      if (renderable.fallback != null) {
        if (fallbackSlot === null) {
          fallbackSlot = createMountedSlot(renderer, renderable.fallback, ns);
          parent.insertBefore(fallbackSlot.fragment, end);
        } else {
          fallbackSlot.update(renderable.fallback);
        }
      } else {
        destroyFallback();
      }
      return;
    }

    destroyFallback();

    const prevRows = rows;
    const prevLen = prevRows.length;

    if (prevLen === 0) {
      const nextRows = new Array<ForRow<unknown>>(nextLen);
      for (let i = 0; i < nextLen; i++) {
        nextRows[i] = mountRow(parent, nextItems[i]!, nextKeys[i]!, i, end);
      }
      rows = nextRows;
      return;
    }

    const result = new Array<ForRow<unknown>>(nextLen);
    let prefixEnd = 0;
    {
      const minLen = Math.min(prevLen, nextLen);
      while (
        prefixEnd < minLen &&
        prevRows[prefixEnd]!.key === nextKeys[prefixEnd]
      ) {
        result[prefixEnd] = prevRows[prefixEnd]!; // update deferred — see bottom
        prefixEnd++;
      }
    }

    // ------------------------------------------------------------------ //
    // Step 2 — common suffix                                              //
    //                                                                     //
    // Walk both lists backward while keys match. Suffix rows are updated  //
    // eagerly because they are already in correct DOM order.              //
    // ------------------------------------------------------------------ //
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
      updateRow(row, nextItems[nextSuffixStart]!, nextSuffixStart);
      result[nextSuffixStart] = row;
    }

    // Remaining windows after prefix/suffix are stripped.
    const oldStart = prefixEnd;
    const oldEnd = prevSuffixStart; // exclusive
    const newStart = prefixEnd;
    const newEnd = nextSuffixStart; // exclusive

    // ------------------------------------------------------------------ //
    // Step 2b — zero-length optimizations after prefix/suffix             //
    // ------------------------------------------------------------------ //
    if (oldStart >= oldEnd) {
      // Nothing left in the old list — insert all remaining new nodes.
      const before: Node =
        oldEnd < prevLen ? prevRows[oldEnd]!.slot.start : end;

      for (let i = newStart; i < newEnd; i++) {
        result[i] = mountRow(parent, nextItems[i]!, nextKeys[i]!, i, before);
      }

      rows = applyPrefixUpdates(
        result,
        prevRows,
        nextItems,
        prefixEnd,
        renderable,
      );
      return;
    }

    if (newStart >= newEnd) {
      // Nothing left in the new list — destroy all remaining old nodes.
      for (let i = oldStart; i < oldEnd; i++) {
        prevRows[i]!.slot.destroy();
      }
      rows = applyPrefixUpdates(
        result,
        prevRows,
        nextItems,
        prefixEnd,
        renderable,
      );
      return;
    }

    // ------------------------------------------------------------------ //
    // Step 3 — index new middle keys; fill sources; detect disorder       //
    //                                                                     //
    // `sources` is an Array — no boxing, predictable memory layout.  //
    //                                                                     //
    // `lastOldPos` starts at 0 and tracks the last old-list position we   //
    // saw when scanning left-to-right. If we ever encounter an old-list   //
    // position *less than* the previous one, a node has moved — we set    //
    // lastOldPos = RearrangeNodes (max SMI) so the condition fires         //
    // immediately for every subsequent node without a separate flag.      //
    // ------------------------------------------------------------------ //
    const middleLen = newEnd - newStart;
    const sources = new Array<number>(middleLen).fill(NewNodeMark);

    // Map: key → index in the *new* middle window [newStart, newEnd)
    const keyIndex = new Map<PropertyKey, number>();

    for (let i = newStart; i < newEnd; i++) {
      keyIndex.set(nextKeys[i]!, i);
    }

    let lastOldPos = 0; // sentinel doubles as rearrange flag (=== RearrangeNodes)

    for (let i = oldStart; i < oldEnd; i++) {
      const row = prevRows[i]!;
      const newPos = keyIndex.get(row.key);

      if (newPos !== undefined) {
        keyIndex.delete(row.key);
        sources[newPos - newStart] = i; // record old position

        // If new position is less than the last we saw, nodes are out of
        // order. Pin lastOldPos to RearrangeNodes — a value no real index
        // can reach — so every subsequent `newPos < lastOldPos` is true.
        if (newPos < lastOldPos) {
          lastOldPos = RearrangeNodes;
        } else if (lastOldPos !== RearrangeNodes) {
          lastOldPos = newPos;
        }

        result[newPos] = row;
      } else {
        row.slot.destroy(); // not present in new list
      }
    }

    const needsRearrange = lastOldPos === RearrangeNodes;
    if (needsRearrange) {
      markLIS(sources);
    }

    const afterMiddle: Node =
      oldEnd < prevLen ? prevRows[oldEnd]!.slot.start : end;
    let cursor: Node = afterMiddle;

    // Right-to-left pass over the new middle window.
    for (let j = middleLen - 1; j >= 0; j--) {
      const newIndex = newStart + j;
      const src = sources[j]!;

      if (src === NewNodeMark) {
        // Brand new node — mount and insert before cursor.
        const row = mountRow(
          parent,
          nextItems[newIndex]!,
          nextKeys[newIndex]!,
          newIndex,
          cursor,
        );
        cursor = row.slot.start;
        result[newIndex] = row;
      } else if (needsRearrange && src !== LISMark) {
        // Existing node that is *not* in LIS — move it.
        const row = result[newIndex]!;
        updateRow(row, nextItems[newIndex]!, newIndex);
        moveRangeBefore(row.slot.start, row.slot.end, cursor);
        cursor = row.slot.start;
      } else {
        // Node is in LIS (or no rearrange needed) — already in place.
        const row = result[newIndex]!;
        updateRow(row, nextItems[newIndex]!, newIndex);
        cursor = row.slot.start;
      }
    }

    rows = applyPrefixUpdates(
      result,
      prevRows,
      nextItems,
      prefixEnd,
      renderable,
    );
  }

  function mountRow(
    parent: Node,
    item: unknown,
    key: PropertyKey,
    index: number,
    before: Node,
  ): ForRow<unknown> {
    const row: ForRow<unknown> = {
      key,
      value: item,
      slot: createMountedSlot(renderer, renderable.children(item, index), ns),
    };
    parent.insertBefore(row.slot.fragment, before);
    return row;
  }

  function updateRow(row: ForRow<unknown>, item: unknown, index: number): void {
    if (row.value !== item) {
      row.value = item;
      row.slot.update(renderable.children(item, index));
    }
  }

  reconcile(renderable.each());

  ownedEffect(renderer.owner, () => {
    const nextItems = renderable.each();

    onEffectStart(() => {
      reconcile(nextItems);
    });
  });

  registerCleanup(renderer.owner, () => {
    destroyFallback();
    destroyRows(rows);
    start.parentNode?.removeChild(start);
    end.parentNode?.removeChild(end);
  });

  return fragment;
}

function resolveKeys(
  nextItems: readonly unknown[],
  renderable: ForRenderable<unknown>,
): PropertyKey[] {
  const keys = new Array<PropertyKey>(nextItems.length);
  const seenKeys = new Set<PropertyKey>();

  for (let i = 0; i < nextItems.length; i++) {
    const key = renderable.by(nextItems[i]!, i);

    if (seenKeys.has(key)) {
      throw new Error(`Duplicate key in <For>: ${String(key)}`);
    }

    seenKeys.add(key);
    keys[i] = key;
  }

  return keys;
}

function markLIS(a: Array<number>): void {
  const len = a.length;
  const parent = new Array<number>(len);
  const index = new Array<number>(len); // tails array: index[i] = position in `a` of the smallest tail for LIS of length i+1
  let lisLen = 0;
  let i = 0;

  // Skip leading NewNodeMark entries.
  for (; a[i] === NewNodeMark; ++i) {
    /* skip */
  }

  index[0] = i++;

  for (; i < len; i++) {
    const k = a[i]!;
    if (k === NewNodeMark) continue;

    const j = index[lisLen]!;

    if (a[j]! < k) {
      // Extend LIS.
      parent[i] = j;
      index[++lisLen] = i;
    } else {
      // Binary search for the leftmost tail >= k.
      let lo = 0;
      let hi = lisLen;

      while (lo < hi) {
        const mid = (lo + hi) >>> 1;

        if (a[index[mid]!]! < k) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }

      if (k < a[index[lo]!]!) {
        if (lo > 0) parent[i] = index[lo - 1]!;
        index[lo] = i;
      }
    }
  }

  // Walk back through parent chain and stamp LISMark onto each LIS member.
  let j = index[lisLen]!;

  for (let remaining = lisLen; remaining >= 0; remaining--) {
    a[j] = LISMark;
    j = parent[j]!;
  }
}

function applyPrefixUpdates(
  result: ForRow<unknown>[],
  prevRows: ForRow<unknown>[],
  nextItems: readonly unknown[],
  prefixEnd: number,
  renderable: ForRenderable<unknown>,
): ForRow<unknown>[] {
  for (let i = prefixEnd - 1; i >= 0; i--) {
    const row = prevRows[i]!;
    const item = nextItems[i]!;

    if (row.value !== item) {
      row.value = item;
      row.slot.update(renderable.children(item, i));
    }
  }
  return result;
}
