import runtime from "../../runtime";
import { ReactiveNode, ReactiveNodeState } from "../shape";

export function propagate(
  node: ReactiveNode,
  flag: ReactiveNodeState = ReactiveNodeState.Invalid,
): void {
  let nextBit = flag;
  runtime.propagatePush(node);

  while (runtime.propagating) {
    const n = runtime.propagatePop()!;

    for (let e = n.firstOut; e; e = e.nextOut) {
      const child = e.to;
      const s = child.runtime;

      if (s & (ReactiveNodeState.Obsolete | nextBit)) {
        continue;
      }

      child.runtime = s | nextBit;

      runtime.propagatePush(child);
    }

    nextBit = ReactiveNodeState.Invalid;
  }
}
