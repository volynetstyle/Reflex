import type { ExecutionContext } from "../context";
import { devAssertPropagateAlive } from "../dev";
import { getDefaultContext } from "../context";
import { type ReactiveEdge, ReactiveNodeState } from "../shape";
import { propagateBranch } from "./propagate.branch";
import { NON_IMMEDIATE } from "./propagate.constants";

export function propagate(
  startEdge: ReactiveEdge,
  promoteImmediate: number = NON_IMMEDIATE,
  context: ExecutionContext = getDefaultContext(),
): void {
  if ((startEdge.from.state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertPropagateAlive();
    return;
  }

  const thrown = propagateBranch(startEdge, promoteImmediate, null, context);
  if (thrown !== null) throw thrown;
}
