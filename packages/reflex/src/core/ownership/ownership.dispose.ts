import { IOwnership, OwnershipStateFlags } from "./ownership.type";

export interface DisposalStrategy {
  onError?: (err: unknown, node: IOwnership) => void;
  beforeDispose?: (nodes: IOwnership[]) => void;
  afterDispose?: (nodes: IOwnership[], errors: number) => void;
}

export function batchDisposer(
  nodes: IOwnership[],
  strategy?: DisposalStrategy
) {
  strategy?.beforeDispose?.(nodes);

  let firstError: unknown;
  let errorCount = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node._state & OwnershipStateFlags.DISPOSED) continue;
    node._state |= OwnershipStateFlags.DISPOSING;

    const disposal = node._disposal;

    for (let j = disposal.length - 1; j >= 0; j--) {
      try {
        disposal[j]();
      } catch (err) {
        if (!firstError) firstError = err;
        errorCount++;
        strategy?.onError?.(err, node);
      }
    }

    node._disposal.length = 0;
    node._firstChild = node._lastChild = undefined;
    node._nextSibling = node._prevSibling = undefined;
    node._parent = undefined;
    node._context = undefined;
    node._childCount = 0;
    node._state = OwnershipStateFlags.DISPOSED;
  }

  strategy?.afterDispose?.(nodes, errorCount);

  if (errorCount > 0 && !strategy?.onError) {
    console.error(
      errorCount === 1
        ? "Error during ownership dispose:" 
        : `${errorCount} errors during ownership dispose. First error:`,
      firstError
    );
  }
}
