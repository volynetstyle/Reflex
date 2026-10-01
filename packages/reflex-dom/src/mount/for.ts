import type { Namespace } from "../host/namespace";
import { untracked } from "@volynets/reflex-runtime";
import { runWithOwner } from "@volynets/reflex-framework";
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

interface ForRow<T> extends KeyedItem<T> {
  slot: ContentSlot;
}

export function mountFor(
  renderable: ForRenderable<unknown>,
  ns: Namespace,
  doc: Document,
): Node {
  const context = getDOMContext();
  const rowOwner = context.owner.currentNode;
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
      slot: runWithOwner(context.owner, rowOwner, () =>
        createMountedSlot(renderable.children(item, index), ns, doc),
      ),
    };

    parent.insertBefore(row.slot.fragment, before);
    return row;
  }

  function updateRow(row: ForRow<unknown>, item: unknown, index: number): void {
    if (row.value === item) {
      return;
    }

    row.value = item;
    runWithOwner(context.owner, rowOwner, () => {
      row.slot.update(renderable.children(item, index));
    });
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
      destroyRows(rows);
      rows = [];

      if (renderable.fallback != null) {
        if (fallbackSlot === null) {
          fallbackSlot = runWithOwner(context.owner, rowOwner, () =>
            createMountedSlot(renderable.fallback, ns, doc),
          );
          parent.insertBefore(fallbackSlot.fragment, end);
        } else {
          runWithOwner(context.owner, rowOwner, () => {
            fallbackSlot!.update(renderable.fallback);
          });
        }
      } else {
        destroyFallback();
      }

      return;
    }

    destroyFallback();

    rows = reconcileKeyedList(rows, nextItems, {
      endAnchor: end,
      getKey: (item, index) => renderable.by(item, index),
      getStart: (row) => row.slot.start,
      mount: (item, key, index, before) =>
        mountRow(parent, item, key, index, before),
      update: updateRow,
      move: (row, before) => {
        moveRangeBefore(row.slot.start, row.slot.end, before);
      },
      remove: (row) => {
        row.slot.destroy();
      },
    }).rows;
  }

  // The list owns its dependency; mounting it inside another reactive slot
  // must not subscribe that parent slot to the list as well.
  untracked(() => reconcile(renderable.each()));

  createDOMOwnedReaction(renderable.each, reconcile);

  registerDOMCleanup(() => {
    destroyFallback();
    destroyRows(rows);
    start.parentNode?.removeChild(start);
    end.parentNode?.removeChild(end);
  });

  return fragment;
}
