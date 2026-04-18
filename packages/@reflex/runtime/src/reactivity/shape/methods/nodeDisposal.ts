import { isDisposedNode, markDisposedNode } from "../ReactiveMeta";
import type ReactiveNode from "../ReactiveNode";
import { unlinkAllSources, unlinkAllSubscribers } from "./edgeSweep";

export function disposeNode(node: ReactiveNode): void {
  if (isDisposedNode(node)) return;

  markDisposedNode(node);
  node.depsTail = null;
  unlinkAllSources(node);
  unlinkAllSubscribers(node);
  node.compute = null;
  node.payload = undefined;
}

export function disposeNodeEvent(node: ReactiveNode): void {
  disposeNode(node);
}
