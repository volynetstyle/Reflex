import {
  defaultContext,
  emitNodeInvalidated,
  nodeInvalidatedHook,
} from "@runtime/kernel/config";
import { abortPropagationScope } from "@runtime/kernel/context.scope";
import { devRecordPropagate } from "@runtime/kernel/dev";
import {
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "@runtime/kernel/execution";
import {
  Changed,
  Computing,
  DIRTY_STATE,
  Unknown,
  Visited,
  Watcher,
  type ReactiveEdge,
  type ReactiveNode,
} from "@runtime/kernel/shape";
import { readRuntimeWalkerStackStats } from "@runtime/kernel/stages/stackStats";
import {
  isRuntimeProfilingEnabled,
  profileRuntimeCounter,
  profileRuntimeCounterBy,
  profileRuntimePushPath,
} from "@runtime/profiling";

const FAST_BLOCK_MASK = DIRTY_STATE | Computing;

const propagateStack: ReactiveEdge[] = new Array(512).fill(null);
const MAX_RETAINED_PROPAGATE_STACK = 512;
const propagateDepthStack: number[] | undefined = __PROFILE__
  ? new Array(512).fill(0)
  : undefined;
let propagateStackHigh = 0;

function resetPropagateStackAfterAbort(
  stack: ReactiveEdge[],
  base: number,
  top: number,
): void {
  while (top !== base) stack[--top] = null!;
  propagateStackHigh = base;
}

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
 * Rare re-entrant tracking path. Keeping the backwards edge scan out of the
 * common clean/already-dirty loops leaves Maglev and TurboFan with a much
 * smaller hot control-flow graph.
 */
function markComputingSubscriber(
  edge: ReactiveEdge,
  sub: ReactiveNode<unknown>,
  state: number,
): number {
  profileRuntimeCounter("pushComputingChecked");

  const tail = sub.tailIn;
  if (tail === null) return 0;

  if (edge !== tail) {
    for (
      let current = edge.prevIn;
      current !== null;
      current = current.prevIn
    ) {
      if (current === tail) return 0;
    }
  }

  return (sub.state = state | Visited | Unknown);
}
/**
 * Push invalidation iterator:
 * - direct subscribers get Changed
 * - transitive subscribers get Unknown
 */
function pushIteratorCore(firstOut: ReactiveEdge | null): void {
  // if (firstOut === null) return;

  profileRuntimeCounter("pushCalls");

  const stack = propagateStack;
  // [ outer live stack ][ nested live stack ][ free capacity ]
  // 0                  base                top
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
    } else if ((state & Unknown) !== 0 && (state & Watcher) === 0) {
      next = (state & ~(Unknown | Visited)) | Changed;
      sub.state = next;
    } else if ((state & Computing) !== 0) {
      next = markComputingSubscriber(edge, sub, state);
    }

    if (next === 0) {
      if (__PROFILE__) {
        profileRuntimeCounter("pushAlreadyDirtySkipped");
        profilePushNode("direct.skip", sub, 1, top - base);
      }
      continue;
    }

    if (__PROFILE__) {
      profileRuntimeCounter(
        (next & Changed) !== 0 ? "pushMarkedChanged" : "pushMarkedInvalid",
      );
      profilePushNode(
        (next & Changed) !== 0 ? "direct.changed" : "direct.unknown",
        sub,
        1,
        top - base,
      );
    }
    devRecordPropagate(edge, next, true, defaultContext);

    if ((next & Watcher) !== 0 && emitNodeInvalidated) {
      if (__PROFILE__) {
        profileRuntimeCounter("pushWatchersInvalidated");
        profilePushNode("direct.watcher", sub, 1, top - base);
      }

      propagateStackHigh = top;
      try {
        emitNodeInvalidated(sub);
      } catch (error) {
        resetPropagateStackAfterAbort(stack, base, top);
        abortPropagationScope();
        throw error;
      }
      continue;
    }

    const child = sub.firstOut;
    if (child !== null) {
      profileRuntimeCounter("pushChildBranchesQueued");

      if (__PROFILE__) propagateDepthStack![top] = 2;
      stack[top++] = child;
    }
  }

  /**
   * Phase 2:
   * Transitive DFS.
   *
   * Everything below direct level gets Unknown.
   */
  while (top !== base) {
    const index = --top;
    let edge: ReactiveEdge | null = stack[index]!;
    stack[index] = null!;
    let depth = __PROFILE__ ? propagateDepthStack![top]! : 0;

    while (edge !== null) {
      profileRuntimeCounter("pushTransitiveEdgesVisited");

      const sub: ReactiveNode<unknown> = edge.to;
      const state = sub.state;

      let next = 0;

      if ((state & FAST_BLOCK_MASK) === 0) {
        next = (state & ~Visited) | Unknown;
        sub.state = next;
      } else if ((state & Computing) !== 0) {
        next = markComputingSubscriber(edge, sub, state);
      }

      if (next !== 0) {
        if (__PROFILE__) {
          profileRuntimeCounter("pushMarkedInvalid");
          profilePushNode("transitive.unknown", sub, depth, top - base);
        }
        devRecordPropagate(edge, next, false, defaultContext);

        if ((next & Watcher) !== 0 && nodeInvalidatedHook) {
          if (__PROFILE__) {
            profileRuntimeCounter("pushWatchersInvalidated");
            profilePushNode("transitive.watcher", sub, depth, top - base);
          }

          propagateStackHigh = top;
          try {
            if (__DEV__) emitNodeInvalidated(sub);
            if (!__DEV__) nodeInvalidatedHook(sub);
          } catch (error) {
            resetPropagateStackAfterAbort(stack, base, top);

            if (__DEV__) abortPropagationScope();
            throw error;
          }
        } else {
          const child = sub.firstOut;

          if (child !== null) {
            const sibling = edge.nextOut;

            if (sibling !== null) {
              profileRuntimeCounter("pushChildBranchesQueued");

              if (__PROFILE__) propagateDepthStack![top] = depth;
              stack[top++] = sibling;
            }

            edge = child;
            if (__PROFILE__) depth += 1;
            continue;
          }
        }
      } else {
        if (__PROFILE__) {
          profileRuntimeCounter("pushAlreadyDirtySkipped");
          profilePushNode("transitive.skip", sub, depth, top - base);
        }
      }

      edge = edge.nextOut;
    }
  }

  propagateStackHigh = base;
  if (base === 0 && stack.length > MAX_RETAINED_PROPAGATE_STACK) {
    if (__PROFILE__) {
      profileRuntimeCounter("pushStackTrimEvents");
      profileRuntimeCounterBy(
        "pushStackTrimExcess",
        stack.length - MAX_RETAINED_PROPAGATE_STACK,
      );
    }
    stack.length = MAX_RETAINED_PROPAGATE_STACK;
  }
}

export const push_iterator: (firstOut: ReactiveEdge | null) => void = __DEV__
  ? function pushIteratorDev(firstOut): void {
      enterRuntimePhase(RuntimePhase.Propagating);

      try {
        pushIteratorCore(firstOut);
      } finally {
        leaveRuntimePhase();
      }
    }
  : pushIteratorCore;

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
