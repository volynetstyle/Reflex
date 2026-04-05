import { devAssertPropagateAlive } from "../dev";
import { type ReactiveEdge, ReactiveNodeState } from "../shape";
import { propagateBranch } from "./propagate.branch";
import { NON_IMMEDIATE } from "./propagate.constants";

export function propagate(
  startEdge: ReactiveEdge,
  promoteImmediate: number = NON_IMMEDIATE,
): void {
  if ((startEdge.from.state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertPropagateAlive();
    return;
  }

  const thrown = propagateBranch(startEdge, promoteImmediate, null);
  if (thrown !== null) throw thrown;
}
