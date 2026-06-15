import { emitSinkInvalidated } from "../../context";
import {
  runtimeProfileCounters,
  runtimeProfileCountersEnabled,
} from "../../../profiling";
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
  if (firstOut === null) return;

  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters.pushCalls += 1;
  }

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
    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      runtimeProfileCounters.pushDirectEdgesVisited += 1;
    }

    const sub: ReactiveNode<unknown> = edge.to;
    const state = sub.state;

    let next = 0;

    if ((state & FAST_BLOCK_MASK) === 0) {
      next = (state & ~Visited) | Changed;
      sub.state = next;
    } else if ((state & Computing) !== 0) {
      if (__PROFILE__ && runtimeProfileCountersEnabled) {
        runtimeProfileCounters.pushComputingChecked += 1;
      }

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
      if (__PROFILE__ && runtimeProfileCountersEnabled) {
        runtimeProfileCounters.pushAlreadyDirtySkipped += 1;
      }
      continue;
    }

    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      if ((next & Changed) !== 0) {
        runtimeProfileCounters.pushMarkedChanged += 1;
      } else {
        runtimeProfileCounters.pushMarkedInvalid += 1;
      }
    }

    if ((next & Watcher) !== 0) {
      if (__PROFILE__ && runtimeProfileCountersEnabled) {
        runtimeProfileCounters.pushWatchersInvalidated += 1;
      }

      propagateStackHigh = top;
      emitSinkInvalidated(sub);
      continue;
    }

    const child = sub.firstOut;
    if (child !== null) {
      if (__PROFILE__ && runtimeProfileCountersEnabled) {
        runtimeProfileCounters.pushChildBranchesQueued += 1;
      }

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
      if (__PROFILE__ && runtimeProfileCountersEnabled) {
        runtimeProfileCounters.pushTransitiveEdgesVisited += 1;
      }

      const sub: ReactiveNode<unknown> = edge.to;
      const state = sub.state;

      let next = 0;

      if ((state & FAST_BLOCK_MASK) === 0) {
        next = (state & ~Visited) | Invalid;
        sub.state = next;
      } else if ((state & Computing) !== 0) {
        if (__PROFILE__ && runtimeProfileCountersEnabled) {
          runtimeProfileCounters.pushComputingChecked += 1;
        }

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
        if (__PROFILE__ && runtimeProfileCountersEnabled) {
          runtimeProfileCounters.pushMarkedInvalid += 1;
        }

        if ((next & Watcher) !== 0) {
          if (__PROFILE__ && runtimeProfileCountersEnabled) {
            runtimeProfileCounters.pushWatchersInvalidated += 1;
          }

          propagateStackHigh = top;
          emitSinkInvalidated(sub);
        } else {
          const child = sub.firstOut;

          if (child !== null) {
            const sibling = edge.nextOut;

            if (sibling !== null) {
              if (__PROFILE__ && runtimeProfileCountersEnabled) {
                runtimeProfileCounters.pushChildBranchesQueued += 1;
              }

              stack[top++] = sibling;
            }

            edge = child;
            continue;
          }
        }
      } else if (__PROFILE__ && runtimeProfileCountersEnabled) {
        runtimeProfileCounters.pushAlreadyDirtySkipped += 1;
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
