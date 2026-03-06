import { ReactiveNode, ReactiveNodeState } from "../shape";

export function propagate(node: ReactiveNode, obsolete = false): void {
  const stack: ReactiveNode[] = [node];
  let nextBit = obsolete
    ? ReactiveNodeState.Obsolete
    : ReactiveNodeState.Invalid;

  while (stack.length) {
    const n = stack.pop()!;

    for (let e = n.firstOut; e; e = e.nextOut) {
      const child = e.to;
      const s = child.runtime;

      if (s & ReactiveNodeState.Obsolete) {
        continue; // already maximally dirty
      }

      if (s & ReactiveNodeState.Queued) {
        child.runtime = s | nextBit;
        continue;
      }

      if (s & nextBit) {
        continue; // bit already set
      }

      child.runtime = s | nextBit;
      stack.push(child);
    }

    nextBit = ReactiveNodeState.Invalid; // only the first level gets Obsolete
  }
}
