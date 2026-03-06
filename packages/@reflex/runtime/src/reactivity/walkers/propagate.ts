import { ReactiveNode, ReactiveNodeState } from "../shape";

export function propagate(
  node: ReactiveNode,
  flag: ReactiveNodeState = ReactiveNodeState.Invalid,
): void {
  const stack: ReactiveNode[] = [node];
  let nextBit = flag;

  while (stack.length) {
    const n = stack.pop()!;

    for (let e = n.firstOut; e; e = e.nextOut) {
      const child = e.to;
      const s = child.runtime;

      if (s & (ReactiveNodeState.Obsolete | nextBit)) continue;

      child.runtime = s | nextBit;

      if (!(s & ReactiveNodeState.Queued)) {
        stack.push(child);
      }
    }

    nextBit = ReactiveNodeState.Invalid;
  }
}
