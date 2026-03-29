import { compare } from "./compare";
import type { ReactiveNode } from "../reactivity";
import type { ExecutionContext } from "../reactivity/context";
import { DIRTY_STATE, IMMEDIATE, propagate } from "../reactivity";
import { recordDebugEvent } from "../debug";
import { getDefaultContext } from "../reactivity/context";

export function writeProducer<T>(
  node: ReactiveNode<T>,
  value: T,
  context: ExecutionContext = getDefaultContext(),
): void {
  const previous = node.payload;

  if (compare(previous, value)) {
    if (__DEV__) {
      recordDebugEvent(context, "write:producer", {
        node,
        detail: {
          changed: false,
          next: value,
          previous,
        },
      });
    }

    return;
  }

  node.payload = value;
  node.state &= ~DIRTY_STATE;

  const firstSubscriberEdge = node.firstOut;

  if (__DEV__) {
    recordDebugEvent(context, "write:producer", {
      node,
      detail: {
        changed: true,
        next: value,
        previous,
        hasSubscribers: firstSubscriberEdge !== null,
      },
    });
  }

  if (firstSubscriberEdge === null) return;

  context.enterPropagation();

  try {
    propagate(firstSubscriberEdge, IMMEDIATE, context);
  } finally {
    context.leavePropagation();
  }
}
