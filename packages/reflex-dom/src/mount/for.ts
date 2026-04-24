import type { Namespace } from "../host/namespace";
import { moveRangeBefore } from "../host/mutations";
import {
  onEffectStart,
  registerCleanup,
  useOwnedEffect,
} from "@volynets/reflex-framework";
import type { ForRenderable } from "../operators";
import { reconcileKeyedList, type KeyedItem } from "../reconcile/keyed";
import type { DOMRenderer } from "../runtime/renderer";
import type { ContentSlot } from "../structure/content-slot";
import { createMountedSlot } from "../structure/reactive-slot";

interface ForRow<T> extends KeyedItem<T> {
  slot: ContentSlot;
}

export function mountFor(
  renderer: DOMRenderer,
  renderable: ForRenderable<unknown>,
  ns: Namespace,
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
    if (row.value === item) {
      return;
    }

    row.value = item;
    row.slot.update(renderable.children(item, index));
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

  reconcile(renderable.each());

  useOwnedEffect({ owner: renderer.owner }, () => {
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
