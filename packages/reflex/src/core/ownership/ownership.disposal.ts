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
  if (!nodes.length) return;

  const { beforeDispose, afterDispose, onError } = strategy ?? {};
  beforeDispose?.(nodes);

  let firstError: unknown = undefined;
  let errorCount = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const state = node._state;

    if (Bitwise.has(state, OwnershipStateFlags.DISPOSED)) continue;

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

    disposal.length = 0;

    // unlink and clear references for GC
    node._firstChild = undefined;
    node._lastChild = undefined;
    node._nextSibling = undefined;
    node._prevSibling = undefined;
    node._parent = undefined;
    node._context = undefined;
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
