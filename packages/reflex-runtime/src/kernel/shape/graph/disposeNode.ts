import type ReactiveNode from "../node";
import { clearGraphReductionState } from "../../reduction";
import { unlinkAllSources, unlinkAllSubscribers } from "./sweepEdges";

export function disposeNode(node: ReactiveNode): void {
  clearGraphReductionState(node);
  node.tailIn = null;
  unlinkAllSources(node);
  unlinkAllSubscribers(node);
  node.compute = null;
  node.payload = undefined;
}

export function disposeNodeEvent(node: ReactiveNode): void {
  disposeNode(node);
}
