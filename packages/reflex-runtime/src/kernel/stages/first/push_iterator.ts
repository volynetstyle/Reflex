import { emitSinkInvalidated } from "../../context";
import {
  isRuntimeProfilingEnabled,
  profileRuntimeCounter,
  profileRuntimePushPath,
} from "../../../profiling";
import { defaultContext } from "../../context";
import { devRecordPropagate } from "../../dev";
import {
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "../../execution";
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
const propagateDepthStack: number[] | undefined = __PROFILE__
  ? new Array(512).fill(0)
  : undefined;
let propagateStackHigh = 0;

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
  if (__PROFILE__) profileRuntimeCounter("pushComputingChecked");

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

  const next = state | Visited | Invalid;
  sub.state = next;
  return next;
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
 * Push invalidation iterator:
 * - direct subscribers get Changed
 * - transitive subscribers get Invalid
 */
function pushIteratorCore(firstOut: ReactiveEdge | null): void {
  // if (firstOut === null) return;

  if (__PROFILE__) profileRuntimeCounter("pushCalls");

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
    if (__PROFILE__) profileRuntimeCounter("pushDirectEdgesVisited");

    const sub: ReactiveNode<unknown> = edge.to;
    const state = sub.state;

    let next = 0;

    if ((state & FAST_BLOCK_MASK) === 0) {
      next = (state & ~Visited) | Changed;
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
        (next & Changed) !== 0 ? "direct.changed" : "direct.invalid",
        sub,
        1,
        top - base,
      );
    }
    if (__DEV__) devRecordPropagate(edge, next, true, defaultContext);

    if ((next & Watcher) !== 0) {
      if (__PROFILE__) {
        profileRuntimeCounter("pushWatchersInvalidated");
        profilePushNode("direct.watcher", sub, 1, top - base);
      }

      propagateStackHigh = top;
      emitSinkInvalidated(sub);
      continue;
    }

    const child = sub.firstOut;
    if (child !== null) {
      if (__PROFILE__) profileRuntimeCounter("pushChildBranchesQueued");

      if (__PROFILE__) propagateDepthStack![top] = 2;
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
    let depth = __PROFILE__ ? propagateDepthStack![top]! : 0;

    while (edge !== null) {
      if (__PROFILE__) profileRuntimeCounter("pushTransitiveEdgesVisited");

      const sub: ReactiveNode<unknown> = edge.to;
      const state = sub.state;

      let next = 0;

      if ((state & FAST_BLOCK_MASK) === 0) {
        next = (state & ~Visited) | Invalid;
        sub.state = next;
      } else if ((state & Computing) !== 0) {
        next = markComputingSubscriber(edge, sub, state);
      }

      if (next !== 0) {
        if (__PROFILE__) {
          profileRuntimeCounter("pushMarkedInvalid");
          profilePushNode("transitive.invalid", sub, depth, top - base);
        }
        if (__DEV__) devRecordPropagate(edge, next, false, defaultContext);

        if ((next & Watcher) !== 0) {
          if (__PROFILE__) {
            profileRuntimeCounter("pushWatchersInvalidated");
            profilePushNode("transitive.watcher", sub, depth, top - base);
          }

          propagateStackHigh = top;
          emitSinkInvalidated(sub);
        } else {
          const child = sub.firstOut;

          if (child !== null) {
            const sibling = edge.nextOut;

            if (sibling !== null) {
              if (__PROFILE__) profileRuntimeCounter("pushChildBranchesQueued");

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
