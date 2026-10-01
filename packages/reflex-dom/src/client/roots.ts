import { createRootMountTable } from "@volynets/reflex-framework";
import {
  createRangeAnchors,
  adoptRangeAnchors,
  type RangeAnchors,
  type OwnedRange,
} from "../structure/owned-range";
import { runDOMOperation, type DOMContext } from "../runtime/context";
import type { Cleanup } from "../types";

type Container = ParentNode & Node;
// The table lives on containers, so renderers agree on which root owns a range.
const roots = createRootMountTable<Container, OwnedRange>("root");

function rootCleanup(
  context: DOMContext,
  container: Container,
  root: OwnedRange,
): Cleanup {
  const dispose = (() =>
    runDOMOperation(context, () => {
      root.clear();
      // A stale disposer must never remove a replacement's shared anchors.
      if (roots.get(container) !== root) return;
      roots.unset(container);
      root.destroy();
    })) as Cleanup;
  dispose.dispose = dispose;
  return dispose;
}

/** One registration, rollback and disposal path for render, hydrate and resume. */
export function replaceRoot(
  context: DOMContext,
  container: Container,
  build: (anchors: RangeAnchors) => OwnedRange,
  adopt = false,
): Cleanup {
  let dispose: Cleanup | undefined;
  let anchors: RangeAnchors | undefined;
  try {
    return runDOMOperation(context, () => {
      const previous = roots.get(container);
      const attached =
        previous?.startAnchor.parentNode === container &&
        previous.endAnchor.parentNode === container;
      anchors = attached
        ? previous
        : adopt
          ? adoptRangeAnchors(container)
          : createRangeAnchors(container);
      previous?.clear();
      roots.unset(container);
      const root = build(anchors);
      roots.set(container, root);
      dispose = rootCleanup(context, container, root);
      return dispose;
    });
  } catch (error) {
    // Includes effects that fail while the outer batch is closing.
    if (dispose !== undefined) dispose();
    else if (anchors !== undefined) {
      anchors.startAnchor.remove();
      anchors.endAnchor.remove();
    }
    throw error;
  }
}

export function existingRootCleanup(
  context: DOMContext,
  container: Container,
): Cleanup | undefined {
  const root = roots.get(container);
  return root === undefined ? undefined : rootCleanup(context, container, root);
}
