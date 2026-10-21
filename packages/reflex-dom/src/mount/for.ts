import type { Namespace } from "../host/namespace";
import {
  createProducer,
  readProducer,
  untracked,
  writeProducer,
  type ProducerNode,
} from "@volynets/reflex-runtime";
import { currentConsumer } from "@volynets/reflex-runtime/internal";
import {
  createOwnershipNode,
  disposeOwnershipNode,
  runWithOwner,
  runWithOwnershipNode,
  type OwnershipNode,
} from "@volynets/reflex-framework";
import { moveRangeBefore } from "../host/mutations";
import type { ForRenderable } from "../operators";
import { reconcileKeyedList, type KeyedItem } from "../reconcile/keyed";
import { getDOMContext } from "../runtime/context";
import {
  createDOMOwnedReaction,
  registerDOMCleanup,
} from "../runtime/lifetime";
import type { ContentSlot } from "../structure/content-slot";
import { createMountedSlot } from "../mount/slot";
import { appendRenderableNodes } from "./append";
import { bindDOMRangeRef } from "./range-ref";

/**
 * A mounted row: its ownership node, the first and last top-level nodes of its
 * content, and its current item and index.
 *
 * Top-level nodes produced by `appendRenderableNodes` are never replaced while
 * they are mounted (dynamic content lives between the anchors of nested
 * slots), so they bound the row for moves and removal without anchors of its
 * own. Empty content is represented by an empty text node.
 *
 * The renderer receives the item and the index as accessors. A row keeps its
 * DOM and ownership while its key stays in the list: a new item object or a
 * new position only writes the producers behind the accessors. A producer is
 * created on the first tracked read, so values read only at mount, or an index
 * that is never read, cost nothing on updates and reorders.
 */
interface ForRow<T> extends KeyedItem<T> {
  index: number;
  owner: OwnershipNode;
  first: Node;
  last: Node;
  itemNode: ProducerNode<T> | null;
  indexNode: ProducerNode<number> | null;
  readonly item: () => T;
  readonly position: () => number;
}

function createRow<T>(
  key: PropertyKey,
  value: T,
  index: number,
  owner: OwnershipNode,
): ForRow<T> {
  const row: ForRow<T> = {
    key,
    value,
    index,
    owner,
    first: null!,
    last: null!,
    itemNode: null,
    indexNode: null,
    item: () => {
      const node = row.itemNode;
      if (node !== null) return readProducer(node);
      // An untracked read cannot observe later values: no producer needed.
      if (currentConsumer === null) return row.value;
      return readProducer((row.itemNode = createProducer(row.value)));
    },
    position: () => {
      const node = row.indexNode;
      if (node !== null) return readProducer(node);
      if (currentConsumer === null) return row.index;
      return readProducer((row.indexNode = createProducer(row.index)));
    },
  };
  return row;
}

function removeRowNodes(row: ForRow<unknown>): void {
  const last = row.last;
  let node: Node | null = row.first;
  const parent = node.parentNode;
  if (parent === null) return;

  while (node !== null) {
    const next: Node | null = node === last ? null : node.nextSibling;
    parent.removeChild(node);
    node = next;
  }
}

export function mountFor(
  renderable: ForRenderable<unknown>,
  ns: Namespace,
  doc: Document,
): Node {
  const context = getDOMContext();
  const owner = context.owner;
  const rowOwner = owner.currentNode;
  const fragment = doc.createDocumentFragment();
  const start = doc.createComment("");
  const end = doc.createComment("");
  fragment.appendChild(start);
  fragment.appendChild(end);

  // Rows are mounted into this fragment and then inserted with one call.
  const scratch = doc.createDocumentFragment();

  let rows: ForRow<unknown>[] = [];
  let fallbackSlot: ContentSlot | null = null;

  let pendingRow: ForRow<unknown> | null = null;
  let pendingTarget: Node = scratch;

  const mountPending = (): void => {
    const row = pendingRow!;
    appendRenderableNodes(
      pendingTarget,
      renderable.children(row.item, row.position),
      ns,
    );
  };

  /** Mounts one row at the end of `target` (a fragment). */
  function mountRowInto(
    target: Node,
    item: unknown,
    key: PropertyKey,
    index: number,
  ): ForRow<unknown> {
    const rowNode = createOwnershipNode();
    const previousLast = target.lastChild;
    const row = createRow(key, item, index, rowNode);

    pendingRow = row;
    pendingTarget = target;

    try {
      runWithOwnershipNode(owner, rowNode, mountPending);
    } catch (error) {
      while (target.lastChild !== previousLast) {
        target.removeChild(target.lastChild!);
      }
      disposeOwnershipNode(rowNode);
      throw error;
    } finally {
      pendingRow = null;
    }

    let first =
      previousLast === null ? target.firstChild : previousLast.nextSibling;

    if (first === null) {
      first = doc.createTextNode("");
      target.appendChild(first);
    }

    row.first = first;
    row.last = target.lastChild!;
    return row;
  }

  function destroyRow(row: ForRow<unknown>): void {
    // Detach the nodes before disposal: cleanups of nested slots at the row's
    // edges remove their own anchors, which are the row's boundaries.
    removeRowNodes(row);
    disposeOwnershipNode(row.owner);
  }

  function clearRows(currentRows: readonly ForRow<unknown>[]): void {
    if (currentRows.length === 0) return;

    const parent = end.parentNode;

    if (
      parent !== null &&
      start.parentNode === parent &&
      start.previousSibling === null &&
      end.nextSibling === null
    ) {
      // The list owns the whole parent: drop all rows in one native call.
      parent.textContent = "";
      parent.appendChild(start);
      parent.appendChild(end);
    } else {
      for (let i = 0; i < currentRows.length; i++) {
        removeRowNodes(currentRows[i]!);
      }
    }

    for (let i = 0; i < currentRows.length; i++) {
      disposeOwnershipNode(currentRows[i]!.owner);
    }
  }

  function destroyFallback(): void {
    fallbackSlot?.destroy();
    fallbackSlot = null;
  }

  function reconcileRows(parent: Node, nextItems: readonly unknown[]): void {
    rows = reconcileKeyedList(rows, nextItems, {
      endAnchor: end,
      getKey: (item, index) => renderable.by(item, index),
      getStart: (row) => row.first,
      mount: (item, key, index, before) => {
        const row = mountRowInto(scratch, item, key, index);
        parent.insertBefore(scratch, before);
        return row;
      },
      mountRange: (items, keys, from, to, before, out) => {
        for (let i = from; i < to; i++) {
          out[i] = mountRowInto(scratch, items[i], keys[i]!, i);
        }
        parent.insertBefore(scratch, before);
      },
      update: (row, item, index) => {
        if (row.value !== item) {
          row.value = item;
          if (row.itemNode !== null) writeProducer(row.itemNode, item);
        }
        if (row.index !== index) {
          row.index = index;
          if (row.indexNode !== null) writeProducer(row.indexNode, index);
        }
      },
      move: (row, before) => {
        if (row.first === row.last) {
          if (row.first.nextSibling !== before) {
            parent.insertBefore(row.first, before);
          }
          return;
        }
        moveRangeBefore(row.first, row.last, before);
      },
      remove: destroyRow,
      clear: clearRows,
    }).rows;
  }

  function reconcile(
    nextItemsRaw: readonly unknown[] | null | undefined,
  ): void {
    const parent = end.parentNode;
    if (parent === null) {
      return;
    }

    const nextItems = nextItemsRaw ?? [];

    if (nextItems.length === 0) {
      clearRows(rows);
      rows = [];

      if (renderable.fallback != null) {
        if (fallbackSlot === null) {
          fallbackSlot = runWithOwner(owner, rowOwner, () =>
            createMountedSlot(renderable.fallback, ns, doc),
          );
          parent.insertBefore(fallbackSlot.fragment, end);
        } else {
          runWithOwner(owner, rowOwner, () => {
            fallbackSlot!.update(renderable.fallback);
          });
        }
      } else {
        destroyFallback();
      }

      return;
    }

    destroyFallback();

    // Rows are owned by the list's owner, not by the reaction run that
    // reconciles them.
    runWithOwner(owner, rowOwner, () => reconcileRows(parent, nextItems));
  }

  // The list owns its dependency; mounting it inside another reactive slot
  // must not subscribe that parent slot to the list as well.
  untracked(() => reconcile(renderable.each()));

  createDOMOwnedReaction(renderable.each, reconcile);

  registerDOMCleanup(() => {
    destroyFallback();
    clearRows(rows);
    rows = [];
    start.parentNode?.removeChild(start);
    end.parentNode?.removeChild(end);
  });

  bindDOMRangeRef(renderable.ref, start, end);

  return fragment;
}
