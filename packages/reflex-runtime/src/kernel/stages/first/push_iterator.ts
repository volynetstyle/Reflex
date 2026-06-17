import { emitSinkInvalidated } from "../../context";
import {
  isRuntimeProfilingEnabled,
  profileRuntimeCounter,
  profileRuntimePushPath,
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
const propagateDepthStack: number[] = new Array(512).fill(0);
let propagateStackHigh = 0;

function countIn(edge: ReactiveEdge | null): number {
  let count = 0;

  for (let current = edge; current !== null; current = current.nextIn) {
    count += 1;
  }

  return count;
}

function countOut(edge: ReactiveEdge | null): number {
  let count = 0;

  for (let current = edge; current !== null; current = current.nextOut) {
    count += 1;
  }

  return count;
}

function profilePushNode(
  branch: string,
  sub: ReactiveNode<unknown>,
  depth: number,
  stackDepth: number,
): void {
  if (__PROFILE__ && isRuntimeProfilingEnabled()) {
    profileRuntimePushPath(
      branch,
      depth,
      countIn(sub.firstIn),
      countOut(sub.firstOut),
      stackDepth,
    );
  }
}

/**
 * Push invalidation iterator:
 * - direct subscribers get Changed
 * - transitive subscribers get Invalid
 */
export function push_iterator(firstOut: ReactiveEdge | null): void {
  // if (firstOut === null) return;

  profileRuntimeCounter("pushCalls");

  const stack = propagateStack;
  const depthStack = propagateDepthStack;
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
      profilePushNode("direct.skip", sub, 1, top - base);
      continue;
    }

    profileRuntimeCounter(
      (next & Changed) !== 0 ? "pushMarkedChanged" : "pushMarkedInvalid",
    );
    profilePushNode(
      (next & Changed) !== 0 ? "direct.changed" : "direct.invalid",
      sub,
      1,
      top - base,
    );

    if ((next & Watcher) !== 0) {
      profileRuntimeCounter("pushWatchersInvalidated");
      profilePushNode("direct.watcher", sub, 1, top - base);

      propagateStackHigh = top;
      emitSinkInvalidated(sub);
      continue;
    }

    const child = sub.firstOut;
    if (child !== null) {
      profileRuntimeCounter("pushChildBranchesQueued");

      depthStack[top] = 2;
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
    let depth = depthStack[top]!;

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
        profilePushNode("transitive.invalid", sub, depth, top - base);

        if ((next & Watcher) !== 0) {
          profileRuntimeCounter("pushWatchersInvalidated");
          profilePushNode("transitive.watcher", sub, depth, top - base);

          propagateStackHigh = top;
          emitSinkInvalidated(sub);
        } else {
          const child = sub.firstOut;

          if (child !== null) {
            const sibling = edge.nextOut;

            if (sibling !== null) {
              profileRuntimeCounter("pushChildBranchesQueued");

              depthStack[top] = depth;
              stack[top++] = sibling;
            }

            edge = child;
            depth += 1;
            continue;
          }
        }
      } else {
        profileRuntimeCounter("pushAlreadyDirtySkipped");
        profilePushNode("transitive.skip", sub, depth, top - base);
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
