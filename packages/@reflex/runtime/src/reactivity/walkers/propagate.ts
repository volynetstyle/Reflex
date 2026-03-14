import runtime from "../../runtime";
import { ReactiveNode, ReactiveNodeState } from "../shape";

export function sourcesChanged(node: ReactiveNode): boolean {
  let e = node.firstIn;

  while (e !== null) {
    if (e.from.v !== e.v) {
      return true;
    }

    e = e.nextIn;
  }

  return false;
}

/**
 * @complexity O(changed subgraph)
 * @param node
 * @returns void
 */
export function propagate(node: ReactiveNode): void {
  if (node.runtime & ReactiveNodeState.Obsolete) {
    return;
  }

  runtime.propagatePush(node);

  while (runtime.propagating) {
    const node = runtime.propagatePop()!;

    if (node.runtime & ReactiveNodeState.Obsolete) {
      continue; // already reached via another path
    }

    node.runtime |= ReactiveNodeState.Obsolete;
    const computedOutQueue =
      node.compute !== null && !(node.runtime & ReactiveNodeState.Queued);

    if (computedOutQueue) {
      node.runtime |= ReactiveNodeState.Queued;
      runtime.enqueue(node);
    }

    for (let e = node.firstOut; e !== null; e = e.nextOut) {
      const next = e.to;

      if (!(next.runtime & ReactiveNodeState.Obsolete)) {
        runtime.propagatePush(next);
      }
    }
  }
}
