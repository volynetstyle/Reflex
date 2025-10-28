import { IOwnership, OwnershipStateFlags } from "./ownership.type";
import { Bitwise } from "../object/utils/bitwise";

export interface DisposalStrategy {
  onError?: (err: unknown, node: IOwnership) => void;
  beforeDispose?: (nodes: IOwnership[]) => void;
  afterDispose?: (nodes: IOwnership[], errors: number) => void;
}

/**
 * Batch disposer for ownership trees.
 * Designed for V8 fast path: minimal allocations, no hidden class transitions.
 */
export function batchDisposer(
  nodes: IOwnership[],
  strategy?: DisposalStrategy
): void {
  const nodesCount = nodes.length;

  if (!nodesCount) {
    return;
  }

  const { beforeDispose, afterDispose, onError } = strategy ?? {};
  beforeDispose?.(nodes);

  let firstError: unknown = undefined;
  let errorCount = 0;

  for (let i = 0; i < nodesCount; i++) {
    const node = nodes[i];
    const state = node._state;

    if (Bitwise.has(node._state, OwnershipStateFlags.DISPOSED)) {
      continue;
    }

    node._state = Bitwise.set(state, OwnershipStateFlags.DISPOSING);

    const disposal = node._disposal;

    if (!disposal || disposal.length === 0) {
      node._state = OwnershipStateFlags.DISPOSED;
      continue;
    }

    // reverse cleanup for LIFO semantics
    for (let j = disposal.length - 1; j >= 0; j--) {
      try {
        disposal[j]();
      } catch (err) {
        if (!firstError) firstError = err;
        errorCount++;
        if (onError) onError(err, node);
      }
    }

    // unlink and clear references for GC
    node._firstChild =
      node._lastChild =
      node._nextSibling =
      node._prevSibling =
      node._parent =
      node._context =
      node._disposal =
        undefined;

    node._childCount = 0;

    node._state = OwnershipStateFlags.DISPOSED;
  }

  afterDispose?.(nodes, errorCount);

  if (errorCount > 0 && !onError) {
    console.error(
      errorCount === 1
        ? "Error during ownership dispose:"
        : `${errorCount} errors during ownership dispose. First error:`,
      firstError
    );
  }
}
