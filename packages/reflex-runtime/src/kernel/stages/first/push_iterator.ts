import {
  defaultContext,
  emitNodeInvalidated,
  nodeInvalidatedHook,
} from "@runtime/kernel/config";
import {
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "@runtime/kernel/execution";
import {
  Changed,
  Computing,
  Both,
  Unknown,
  Visited,
  Watcher,
  type ReactiveEdge,
  type ReactiveNode,
} from "@runtime/kernel/shape";
import { readRuntimeWalkerStackStats } from "@runtime/kernel/stages/stackStats";
import { isRuntimeProfilingEnabled } from "@runtime/profiling";
import {
  observeRuntimeProjection,
  observeRuntimeProjectionAmount,
  observeRuntimePushPath,
} from "@runtime/kernel/projection";
import { observeRuntimePropagate } from "@runtime/kernel/projection.propagate";

const FAST_BLOCK_MASK = Both | Computing;

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
    if (__PROFILE__)
      observeRuntimePushPath?.(
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
  if (__PROFILE__)
    observeRuntimeProjection?.(
      "projection.semantic.push.subscriber.computing.check",
    );

  const tail = sub.tailIn;
  if (tail === null) return 0;

  if (edge !== tail) {
    let current = edge.prevIn;
    while (current !== null) {
      if (current === tail) return 0;
      current = current.prevIn;
      if (current === null) break;
      if (current === tail) return 0;
      current = current.prevIn;
      if (current === null) break;
      if (current === tail) return 0;
      current = current.prevIn;
      if (current === null) break;
      if (current === tail) return 0;
      current = current.prevIn;
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

  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.push.invoke");

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
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.push.edge.direct.visit");

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
    } else if ((state & Unknown) !== 0) {
      // Cold merge: an already scheduled watcher learned that one of its
      // direct dependencies definitely changed.
      next = (state & ~Visited) | Changed;
      sub.state = next;
    }

    if (next === 0) {
      if (__PROFILE__) {
        if (__PROFILE__)
          observeRuntimeProjection?.(
            "projection.semantic.push.subscriber.dirty.skip",
          );
        profilePushNode("direct.skip", sub, 1, top - base);
      }
      continue;
    }

    if (__PROFILE__) {
      if (__PROFILE__)
        observeRuntimeProjection?.(
          (next & Changed) !== 0
            ? "projection.semantic.push.subscriber.changed.mark"
            : "projection.semantic.push.subscriber.invalid.mark",
        );
      profilePushNode(
        (next & Changed) !== 0 ? "direct.changed" : "direct.unknown",
        sub,
        1,
        top - base,
      );
    }
    if (__DEV__)
      observeRuntimePropagate?.({
        edge: edge,
        nextState: next,
        immediate: true,
        context: defaultContext,
      });

    if ((next & Watcher) !== 0) {
      if (__PROFILE__) {
        if (__PROFILE__)
          observeRuntimeProjection?.(
            "projection.semantic.push.watcher.invalidate",
          );
        profilePushNode("direct.watcher", sub, 1, top - base);
      }

      // A watcher that was already transitively Unknown still needs promotion
      // to Changed when a direct dependency changes. It is already owned by
      // the scheduler, though, so do not emit a duplicate invalidation.
      if ((state & (Unknown | Computing)) === Unknown) continue;

      // Direct watchers always cut off descent. Production can omit the
      // no-op emitter when no hook is installed; development retains events.
      if (__DEV__ || nodeInvalidatedHook !== undefined) {
        propagateStackHigh = top;
        try {
          if (__DEV__) emitNodeInvalidated(sub);
          if (!__DEV__) nodeInvalidatedHook!(sub);
        } catch (error) {
          resetPropagateStackAfterAbort(stack, base, top);
          throw error;
        }
      }
      continue;
    }

    const child = sub.firstOut;
    if (child !== null) {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.push.frontier.enqueue");

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
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.push.edge.transitive.visit",
        );

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
          if (__PROFILE__)
            observeRuntimeProjection?.(
              "projection.semantic.push.subscriber.invalid.mark",
            );
          profilePushNode("transitive.unknown", sub, depth, top - base);
        }
        if (__DEV__)
          observeRuntimePropagate?.({
            edge: edge,
            nextState: next,
            immediate: false,
            context: defaultContext,
          });

        if ((next & Watcher) !== 0 && nodeInvalidatedHook) {
          if (__PROFILE__) {
            if (__PROFILE__)
              observeRuntimeProjection?.(
                "projection.semantic.push.watcher.invalidate",
              );
            profilePushNode("transitive.watcher", sub, depth, top - base);
          }

          propagateStackHigh = top;
          try {
            if (__DEV__) emitNodeInvalidated(sub);
            if (!__DEV__) nodeInvalidatedHook(sub);
          } catch (error) {
            resetPropagateStackAfterAbort(stack, base, top);
            throw error;
          }
        } else {
          const child = sub.firstOut;

          if (child !== null) {
            const sibling = edge.nextOut;

            if (sibling !== null) {
              if (__PROFILE__)
                observeRuntimeProjection?.(
                  "projection.semantic.push.frontier.enqueue",
                );

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
          if (__PROFILE__)
            observeRuntimeProjection?.(
              "projection.semantic.push.subscriber.dirty.skip",
            );
          profilePushNode("transitive.skip", sub, depth, top - base);
        }
      }

      edge = edge.nextOut;
    }
  }

  propagateStackHigh = base;
  if (base === 0 && stack.length > MAX_RETAINED_PROPAGATE_STACK) {
    if (__PROFILE__) {
      if (__PROFILE__)
        observeRuntimeProjection?.("projection.semantic.push.stack.trim");
      if (__PROFILE__)
        observeRuntimeProjectionAmount?.(
          "projection.semantic.push.stack.trim.excess",
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
