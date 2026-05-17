import type ReactiveNode from "../node";
import { unlinkAllSources, unlinkAllSubscribers } from "./sweepEdges";

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
