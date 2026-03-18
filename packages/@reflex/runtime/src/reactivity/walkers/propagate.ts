import {
  ReactiveNode,
  getNodeContext,
  hasState,
  isDisposedState,
  isEffectKind,
  ReactiveNodeState,
} from "../shape";

export function markInvalid(node: ReactiveNode): void {
  const ctx = getNodeContext(node);

  if (isDisposedState(node.state)) return;
  if (hasState(node.state, ReactiveNodeState.Invalid)) return;

  const stack = ctx.trawelList;
  let top = 0;

  stack[top] = node;
  ++top;

  while (top) {
    const current = stack[--top]!;

    if (isDisposedState(current.state)) continue;
    if (hasState(current.state, ReactiveNodeState.Invalid)) continue;

    current.state |= ReactiveNodeState.Invalid;

    if (isEffectKind(current)) {
      ctx.notifyEffectInvalidated(current);
    }

    for (let e = current.firstOut; e; e = e.nextOut) {
      const next = e.to;

      if (!hasState(next.state, ReactiveNodeState.Invalid)) {
        stack[top] = next;
        ++top;
      }
    }
  }
}
