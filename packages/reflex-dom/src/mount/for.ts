import type { Namespace } from "../host/namespace";
import {
  createProducer,
  readProducer,
  untracked,
  writeProducer,
  type ProducerNode,
} from "@volynets/reflex-runtime";
import {
  createOwnershipNode,
  disposeOwnershipNode,
  runWithOwner,
  type OwnershipNode,
} from "@volynets/reflex-framework";
import { moveRangeBefore } from "../host/mutations";
import type { ForRenderable } from "../operators";
import {
  reconcileKeyedList,
  type KeyedItem,
  type KeyedReconciliationHooks,
} from "../reconcile/keyed";
import { getDOMContext, type DOMContext } from "../runtime/context";
import {
  createDOMOwnedReaction,
  registerDOMCleanup,
  runInDOMOwnershipNode,
} from "../runtime/lifetime";
import type { ContentSlot } from "../structure/content-slot";
import { createOwnedRange, type OwnedRange } from "../structure/owned-range";
import {
  createHydratedSlot,
  createMountedSlot,
  type HydrateContent,
} from "../mount/slot";
import { consumeHydrationSlot } from "../hydrate/slots";
import { failHydration } from "../hydrate/error";
import { appendRenderableNodes } from "./append";
import { bindDOMRangeRef } from "./range-ref";

/**
 * One keyed row. Its content is created once, under the row's own ownership
 * node; later edits only write `item` and `index`, so DOM, component state and
 * row resources survive replacement of the item object and moves.
 */
interface ForRow<T> extends KeyedItem<T> {
  range: OwnedRange;
  item: ProducerNode<T>;
  index: ProducerNode<number>;
}

interface ForList {
  hydrateRows(first: Node | null, boundary: Node, hydrate: HydrateContent): void;
  reconcile(items: readonly unknown[] | null | undefined): void;
  destroy(): void;
}

function createForList(
  renderable: ForRenderable<unknown>,
  ns: Namespace,
  doc: Document,
  end: Comment,
  context: DOMContext,
): ForList {
  const listNode = context.owner.currentNode;
  let rows: ForRow<unknown>[] = [];
  let fallbackSlot: ContentSlot | null = null;

  function createRow(
    item: unknown,
    key: PropertyKey,
    index: number,
    start: Comment,
    rowEnd: Comment,
  ): ForRow<unknown> {
    return {
      key,
      value: item,
      range: createOwnedRange(createOwnershipNode(), {
        startAnchor: start,
        endAnchor: rowEnd,
      }),
      item: createProducer(item),
      index: createProducer(index),
    };
  }

  /** Runs the row callback and its hooks inside the row's ownership node. */
  function inRow(row: ForRow<unknown>, fn: (content: unknown) => void): void {
    const node: OwnershipNode = row.range.ownershipNode;

    try {
      runWithOwner(context.owner, listNode, () =>
        runInDOMOwnershipNode(
          node,
          () =>
            fn(
              renderable.children(
                () => readProducer(row.item),
                () => readProducer(row.index),
              ),
            ),
          context,
        ),
      );
    } catch (error) {
      disposeOwnershipNode(node);
      throw error;
    }
  }

  function mountRow(
    item: unknown,
    key: PropertyKey,
    index: number,
    before: Node,
  ): ForRow<unknown> {
    const fragment = doc.createDocumentFragment();
    const start = doc.createComment("");
    const rowEnd = doc.createComment("");
    const row = createRow(item, key, index, start, rowEnd);

    fragment.appendChild(start);
    inRow(row, (content) => appendRenderableNodes(fragment, content, ns));
    fragment.appendChild(rowEnd);
    before.parentNode!.insertBefore(fragment, before);
    return row;
  }

  function updateRow(row: ForRow<unknown>, item: unknown, index: number): void {
    row.value = item;
    writeProducer(row.item, item);
    writeProducer(row.index, index);
  }

  const hooks: KeyedReconciliationHooks<unknown, ForRow<unknown>> = {
    endAnchor: end,
    getKey: (item, index) => renderable.by(item, index),
    getStart: (row) => row.range.startAnchor,
    mount: mountRow,
    update: updateRow,
    move(row, before) {
      moveRangeBefore(row.range.startAnchor, row.range.endAnchor, before);
    },
    remove(row) {
      row.range.destroy();
    },
  };

  function destroyRows(): void {
    for (let i = 0; i < rows.length; i++) rows[i]!.range.destroy();
    rows = [];
  }

  function destroyFallback(): void {
    fallbackSlot?.destroy();
    fallbackSlot = null;
  }

  return {
    hydrateRows(first, boundary, hydrate) {
      const items = untracked(renderable.each) ?? [];
      let cursor = first;

      if (items.length === 0) {
        if (renderable.fallback != null) {
          const slot = consumeHydrationSlot(cursor, boundary);
          fallbackSlot = runWithOwner(context.owner, listNode, () =>
            createHydratedSlot(
              renderable.fallback,
              slot.start,
              slot.end,
              ns,
              hydrate,
            ),
          );
          cursor = slot.next;
        }
      } else {
        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          const slot = consumeHydrationSlot(cursor, boundary);
          const row = createRow(
            item,
            renderable.by(item, index),
            index,
            slot.start,
            slot.end,
          );
          const rowFirst =
            slot.start.nextSibling === slot.end ? null : slot.start.nextSibling;
          inRow(row, (content) => hydrate(content, rowFirst, slot.end, ns));
          rows.push(row);
          cursor = slot.next;
        }
      }

      if (cursor !== null) failHydration();
    },

    reconcile(nextItemsRaw) {
      const parent = end.parentNode;
      if (parent === null) return;

      const nextItems = nextItemsRaw ?? [];

      if (nextItems.length === 0) {
        destroyRows();

        if (renderable.fallback == null) {
          destroyFallback();
        } else if (fallbackSlot === null) {
          // The fallback is a fixed renderable; it mounts once per empty state.
          fallbackSlot = runWithOwner(context.owner, listNode, () =>
            createMountedSlot(renderable.fallback, ns, doc),
          );
          parent.insertBefore(fallbackSlot.fragment, end);
        }
        return;
      }

      destroyFallback();
      rows = reconcileKeyedList(rows, nextItems, hooks).rows;
    },

    destroy() {
      destroyFallback();
      destroyRows();
    },
  };
}

function bindForLifecycle(
  list: ForList,
  renderable: ForRenderable<unknown>,
  start: Comment,
  end: Comment,
): void {
  // Rows are created untracked: the list depends only on `each`, never on
  // values read while a row callback or its content runs.
  createDOMOwnedReaction(renderable.each, (items) =>
    untracked(() => list.reconcile(items)),
  );

  registerDOMCleanup(() => {
    list.destroy();
    start.parentNode?.removeChild(start);
    end.parentNode?.removeChild(end);
  });

  bindDOMRangeRef(renderable.ref, start, end);
}

export function mountFor(
  renderable: ForRenderable<unknown>,
  ns: Namespace,
  doc: Document,
): Node {
  const fragment = doc.createDocumentFragment();
  const start = doc.createComment("");
  const end = doc.createComment("");
  fragment.appendChild(start);
  fragment.appendChild(end);

  const list = createForList(renderable, ns, doc, end, getDOMContext());
  // The list owns its dependency; mounting it inside another reactive slot
  // must not subscribe that parent slot to the list as well.
  untracked(() => list.reconcile(renderable.each()));
  bindForLifecycle(list, renderable, start, end);

  return fragment;
}

/** Adopts server-rendered rows as keyed records instead of a generic slot. */
export function hydrateFor(
  renderable: ForRenderable<unknown>,
  ns: Namespace,
  start: Comment,
  end: Comment,
  hydrate: HydrateContent,
): void {
  const list = createForList(
    renderable,
    ns,
    start.ownerDocument,
    end,
    getDOMContext(),
  );
  list.hydrateRows(
    start.nextSibling === end ? null : start.nextSibling,
    end,
    hydrate,
  );
  bindForLifecycle(list, renderable, start, end);
}
