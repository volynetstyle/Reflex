import type ReactiveNode from "@runtime/kernel/shape/node";

import { unlinkAllSources, unlinkAllSubscribers } from "./sweepEdges";

export function disposeNode(node: ReactiveNode): void {
  unlinkAllSources(node);
  unlinkAllSubscribers(node);

  node.compute = undefined;
  node.payload = undefined;
}

export const disposeNodeEvent = disposeNode;
