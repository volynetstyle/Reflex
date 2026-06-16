import { emitSinkInvalidated } from "../../context";
import { profileRuntimeCounter } from "../../../profiling";
import { readRuntimeWalkerStackStats } from "../stackStats";
import type { ReactiveNode } from "../../shape";
import {
  Changed,
  Computing,
  DIRTY_STATE,
  Invalid,
  Visited,
  Watcher,
  type ReactiveEdge,
} from "../../shape";

const FAST_BLOCK_MASK = DIRTY_STATE | Computing;

const propagateStack: ReactiveEdge[] = new Array(512).fill(null);
let propagateStackHigh = 0;

/**
 * Push invalidation iterator:
 * - direct subscribers get Changed
 * - transitive subscribers get Invalid
 */
export function push_iterator(firstOut: ReactiveEdge | null): void {
  // if (firstOut === null) return;

  profileRuntimeCounter("pushCalls");

  const stack = propagateStack;
  const base = propagateStackHigh;
  let top = base;

  /**
   * Phase 1:
   * Direct outgoing edges.
   *
   * No DFS here. Children are only pushed to stack.
   */
  for (
    let edge: ReactiveEdge | null = firstOut;
    edge !== null;
    edge = edge.nextOut
  ) {
    profileRuntimeCounter("pushDirectEdgesVisited");

    const sub: ReactiveNode<unknown> = edge.to;
    const state = sub.state;

    let next = 0;

    if ((state & FAST_BLOCK_MASK) === 0) {
      next = (state & ~Visited) | Changed;
      sub.state = next;
    } else if ((state & Computing) !== 0) {
      profileRuntimeCounter("pushComputingChecked");

      const tail = sub.tailIn;

      if (tail !== null) {
        let confirmed = true;

        if (edge !== tail) {
          for (let p = edge.prevIn; p !== null; p = p.prevIn) {
            if (p === tail) {
              confirmed = false;
              break;
            }
          }
        }

        if (confirmed) {
          next = state | Visited | Invalid;
          sub.state = next;
        }
      }
    }

    if (next === 0) {
      profileRuntimeCounter("pushAlreadyDirtySkipped");
      continue;
    }

    profileRuntimeCounter(
      (next & Changed) !== 0 ? "pushMarkedChanged" : "pushMarkedInvalid",
    );

    if ((next & Watcher) !== 0) {
      profileRuntimeCounter("pushWatchersInvalidated");

      propagateStackHigh = top;
      emitSinkInvalidated(sub);
      continue;
    }

    const child = sub.firstOut;
    if (child !== null) {
      profileRuntimeCounter("pushChildBranchesQueued");

      stack[top++] = child;
    }
  }

  /**
   * Phase 2:
   * Transitive DFS.
   *
   * Everything below direct level gets Invalid.
   */
  while (top !== base) {
    let edge: ReactiveEdge | null = stack[--top]!;

    while (edge !== null) {
      profileRuntimeCounter("pushTransitiveEdgesVisited");

      const sub: ReactiveNode<unknown> = edge.to;
      const state = sub.state;

      let next = 0;

      if ((state & FAST_BLOCK_MASK) === 0) {
        next = (state & ~Visited) | Invalid;
        sub.state = next;
      } else if ((state & Computing) !== 0) {
        profileRuntimeCounter("pushComputingChecked");

        const tail = sub.tailIn;

        if (tail !== null) {
          let confirmed = true;

          if (edge !== tail) {
            for (let p = edge.prevIn; p !== null; p = p.prevIn) {
              if (p === tail) {
                confirmed = false;
                break;
              }
            }
          }

          if (confirmed) {
            next = state | Visited | Invalid;
            sub.state = next;
          }
        }
      }

      if (next !== 0) {
        profileRuntimeCounter("pushMarkedInvalid");

        if ((next & Watcher) !== 0) {
          profileRuntimeCounter("pushWatchersInvalidated");

          propagateStackHigh = top;
          emitSinkInvalidated(sub);
        } else {
          const child = sub.firstOut;

          if (child !== null) {
            const sibling = edge.nextOut;

            if (sibling !== null) {
              profileRuntimeCounter("pushChildBranchesQueued");

              stack[top++] = sibling;
            }

            edge = child;
            continue;
          }
        }
      } else {
        profileRuntimeCounter("pushAlreadyDirtySkipped");
      }

      edge = edge.nextOut;
    }
  }

  propagateStackHigh = base;
}

export const propagate = push_iterator;

export function readPropagateStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readRuntimeWalkerStackStats(
    0,
    0,
    propagateStackHigh,
    propagateStack.length,
  );
}
