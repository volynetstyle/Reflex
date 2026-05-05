import type ReactiveNode from "../ReactiveNode";
import { unlinkAllSources, unlinkAllSubscribers } from "./edgeSweep";

export function disposeNode(node: ReactiveNode): void {
  node.lastInTail = null;
  unlinkAllSources(node);
  unlinkAllSubscribers(node);
  node.compute = null;
  node.payload = undefined;
}

export function disposeNodeEvent(node: ReactiveNode): void {
  disposeNode(node);
}
