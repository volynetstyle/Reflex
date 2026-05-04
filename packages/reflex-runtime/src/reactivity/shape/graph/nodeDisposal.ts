import type ReactiveNode from "../ReactiveNode";
import { NODE_KIND_STATE } from "../ReactiveMeta";
import { unlinkAllSources, unlinkAllSubscribers } from "./edgeSweep";

export function disposeNode(node: ReactiveNode): void {
  node.state &= NODE_KIND_STATE;
  node.lastInTail = null;
  unlinkAllSources(node);
  unlinkAllSubscribers(node);
  node.compute = null;
  node.payload = undefined;
}

export function disposeNodeEvent(node: ReactiveNode): void {
  disposeNode(node);
}
