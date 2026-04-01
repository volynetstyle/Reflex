// ─── shouldRecomputeBranching ─────────────────────────────────────────────────
//
// DFS with explicit stack for nodes that have multiple incoming edges.
// Too large to inline — that's intentional. The linear fast-path avoids
// calling this at all for the common single-dependency chain.
//
// Stack discipline: entries are pushed before descending into a subtree and
// popped during backtrack. stackBase marks the logical bottom for this
// activation so nested re-entrant calls don't see each other's frames.

import type { ExecutionContext } from "../context";
import type {
  ReactiveEdge,
  ReactiveNode} from "../shape";
import {
  ReactiveNodeState,
  DIRTY_STATE,
} from "../shape";
import { refreshProducer, refreshRecompute } from "./recompute.refresh";

export function shouldRecomputeBranching(
  link: ReactiveEdge,
  consumer: ReactiveNode,
  context: ExecutionContext,
  stack: ReactiveEdge[],
  stackTop: number,
  stackBase: number,
): boolean {
  let changed = false;

  outer: while (true) {
    const dep = link.from;
    const depState = dep.state;

    if ((consumer.state & ReactiveNodeState.Changed) !== 0) {
      changed = true;
    } else if ((depState & ReactiveNodeState.Changed) !== 0) {
      // Producer or already-confirmed computed: pick the cheap path.
      changed =
        (depState & ReactiveNodeState.Producer) !== 0
          ? refreshProducer(dep, depState)
          : refreshRecompute(link, dep, context);
    } else if (
      (depState & ReactiveNodeState.Producer) === 0 &&
      (depState & DIRTY_STATE) !== 0
    ) {
      const deps = dep.firstIn;
      if (deps !== null) {
        stack[stackTop++] = link;
        link = deps;
        consumer = dep;
        continue;
      }
      changed = refreshRecompute(link, dep, context);
    }

    if (!changed) {
      const next = link.nextIn;
      if (next !== null) {
        link = next;
        continue;
      }
      consumer.state &= ~ReactiveNodeState.Invalid;
    }

    while (stackTop > stackBase) {
      const parentLink = stack[--stackTop]!;

      if (changed) {
        changed =
          (consumer.state & ReactiveNodeState.Producer) !== 0
            ? refreshProducer(consumer, consumer.state)
            : refreshRecompute(parentLink, consumer, context);
      } else {
        consumer.state &= ~ReactiveNodeState.Invalid;
      }

      consumer = parentLink.to;

      if (!changed) {
        const next = parentLink.nextIn;
        if (next !== null) {
          link = next;
          continue outer;
        }
      }
    }

    return changed;
  }
}
