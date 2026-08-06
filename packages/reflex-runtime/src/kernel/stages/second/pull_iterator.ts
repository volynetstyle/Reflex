import { devAssertRefreshEdge } from "@runtime/kernel/dev";
import {
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "@runtime/kernel/execution";
import {
  Changed,
  Computing,
  Unknown,
  type ReactiveEdge,
  type ReactiveNode,
} from "@runtime/kernel/shape";
import {
  noteShouldRecomputeStackUsage,
  readRuntimeWalkerStackStats,
  STACK_TRIM_MIN_CAPACITY,
} from "@runtime/kernel/stages/stackStats";
import {
  isRuntimeProfilingEnabled,
  profileRuntimeCounter,
  profileRuntimePullPath,
} from "@runtime/profiling";

import { advance } from "./advance";

const stack: ReactiveEdge[] = [];
let high = 0;

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

function profilePullNode(
  branch: string,
  node: ReactiveNode<unknown>,
  depth: number,
  stackDepth: number,
): void {
  if (__PROFILE__ && isRuntimeProfilingEnabled()) {
    profileRuntimePullPath(
      branch,
      depth,
      countIn(node.firstIn),
      countOut(node.firstOut),
      stackDepth,
    );
  }
}

/**
 * Pull dependency walker for dirty incoming dependency links.
 *
 * Semantics:
 * - scans incoming dependency edges;
 * - descends into Unknown dependencies with their own inputs;
 * - refreshes Changed / Unknown leaves through advance();
 * - bubbles confirmed changes upward;
 * - resumes siblings only while the current branch remains stable.
 */
function pullIteratorCore(node: ReactiveNode, edge: ReactiveEdge): boolean {
  if (__PROFILE__) profileRuntimeCounter("pullCalls");

  const base = high;
  let top = base;
  let changed = false;

  scan: while (true) {
    /**
     * If the current node is already Changed, the current dependency edge
     * does not need to be inspected. We are going to bubble anyway.
     */
    if ((node.state & Changed) !== 0) {
      if (__PROFILE__)
        profilePullNode("node.changed", node, top - base, top - base);
      changed = true;
    } else {
      if (__PROFILE__) profileRuntimeCounter("pullEdgesVisited");

      const dep = edge.from;
      const depState = dep.state;

      if (__DEV__ && (depState & Computing) !== 0) {
        high = base;
        if (base === 0 && stack.length > STACK_TRIM_MIN_CAPACITY) {
          stack.length = STACK_TRIM_MIN_CAPACITY;
        }
        throw new Error("Cycle detected while refreshing reactive graph");
      }

      if ((depState & Changed) !== 0) {
        if (__PROFILE__) {
          profileRuntimeCounter("pullChangedDeps");
          profileRuntimeCounter("pullAdvanceCalls");
          profilePullNode(
            "dep.changed.advance",
            dep,
            top - base + 1,
            top - base,
          );
        }

        /**
         * advance() may re-enter pull walking, so expose only the active
         * stack slice before calling it.
         */
        high = top;

        if (__DEV__) {
          devAssertRefreshEdge(dep, edge);
        }

        changed = advance(dep, edge);
      } else if ((depState & Unknown) !== 0) {
        if (__PROFILE__) profileRuntimeCounter("pullInvalidDeps");

        const firstIn = dep.firstIn;

        if (firstIn !== null) {
          if (__PROFILE__) {
            profileRuntimeCounter("pullDescents");
            profilePullNode(
              "dep.unknown.descend",
              dep,
              top - base + 1,
              top - base,
            );
          }

          stack[top] = edge;
          top = top + 1;

          if (__DEV__) {
            noteShouldRecomputeStackUsage(top);
          }

          node = dep;
          edge = firstIn;
          continue scan;
        }

        high = top;

        if (__PROFILE__) {
          profileRuntimeCounter("pullAdvanceCalls");
          profilePullNode(
            "dep.unknown.leaf.advance",
            dep,
            top - base + 1,
            top - base,
          );
        }

        if (__DEV__) {
          devAssertRefreshEdge(dep, edge);
        }

        changed = advance(dep, edge);
      } else {
        if (__PROFILE__) {
          profileRuntimeCounter("pullCleanDeps");
          profilePullNode("dep.clean", dep, top - base + 1, top - base);
        }

        changed = false;
      }
    }

    /**
     * Stable branch: try the next dependency of the same parent before
     * bubbling upward.
     */
    if (!changed) {
      const sibling = edge.nextIn;

      if (sibling !== null) {
        if (__PROFILE__) {
          profileRuntimeCounter("pullStableSiblingScans");
          profilePullNode(
            "sibling.stable",
            sibling.from,
            top - base + 1,
            top - base,
          );
        }

        edge = sibling;
        continue scan;
      }
    }

    if (changed) {
      while (top !== base) {
        top = top - 1;
        high = top;

        const parentEdge = stack[top]!;
        stack[top] = null!;
        if (__PROFILE__) {
          profileRuntimeCounter("pullChangedBubbles");
          profileRuntimeCounter("pullAdvanceCalls");
          profilePullNode(
            "bubble.changed.advance",
            node,
            top - base + 1,
            top - base,
          );
        }
        changed = advance(node, parentEdge);
        node = parentEdge.to;

        if (!changed) {
          const sibling = parentEdge.nextIn;

          if (sibling !== null) {
            if (__PROFILE__) {
              profileRuntimeCounter("pullStableSiblingScans");
              profilePullNode(
                "sibling.after-bubble",
                sibling.from,
                top - base + 1,
                top - base,
              );
            }

            edge = sibling;
            continue scan;
          }

          break;
        }
      }

      if (changed) {
        high = base;
        if (base === 0 && stack.length > STACK_TRIM_MIN_CAPACITY) {
          stack.length = STACK_TRIM_MIN_CAPACITY;
        }
        return true;
      }
    }

    /**
     * Stable bubble phase.
     *
     * Pop parent continuations until:
     * - a stable parent has another sibling to scan;
     * - or the root of this pull walk is reached.
     */
    while (top !== base) {
      top = top - 1;
      high = top;

      const parentEdge = stack[top]!;
      stack[top] = null!;
      node.state &= ~Unknown;
      node = parentEdge.to;

      const sibling = parentEdge.nextIn;

      if (sibling !== null) {
        if (__PROFILE__) {
          profileRuntimeCounter("pullStableSiblingScans");
          profilePullNode(
            "sibling.after-stable-pop",
            sibling.from,
            top - base + 1,
            top - base,
          );
        }

        edge = sibling;
        continue scan;
      }
    }

    if (!changed) {
      node.state &= ~Unknown;
    }

    high = base;
    if (base === 0 && stack.length > STACK_TRIM_MIN_CAPACITY) {
      stack.length = STACK_TRIM_MIN_CAPACITY;
    }
    return changed;
  }
}

export const pull_iterator: (
  node: ReactiveNode,
  edge: ReactiveEdge,
) => boolean = __DEV__
  ? function pullIteratorDev(node, edge): boolean {
      enterRuntimePhase(RuntimePhase.Pulling);

      try {
        return pullIteratorCore(node, edge);
      } finally {
        leaveRuntimePhase();
      }
    }
  : pullIteratorCore;

export function readShouldRecomputeStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readRuntimeWalkerStackStats(high, stack.length, 0, 0);
}
