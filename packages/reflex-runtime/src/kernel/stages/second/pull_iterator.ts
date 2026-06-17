import {
  noteShouldRecomputeStackUsage,
  readRuntimeWalkerStackStats,
  trimWalkerStackToFloorIfSparse,
} from "../stackStats";
import { devAssertRefreshEdge } from "../../dev";
import {
  isRuntimeProfilingEnabled,
  profileRuntimeCounter,
  profileRuntimePullPath,
} from "../../../profiling";
import type { ReactiveEdge, ReactiveNode } from "../../shape";
import { Changed, Invalid } from "../../shape";
import {
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "../../execution";
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
 * - descends into Invalid dependencies with their own inputs;
 * - refreshes Changed / Invalid leaves through advance();
 * - bubbles confirmed changes upward;
 * - resumes siblings only while the current branch remains stable.
 */
export function pull_iterator(node: ReactiveNode, edge: ReactiveEdge): boolean {
  if (__DEV__) enterRuntimePhase(RuntimePhase.Pulling);

  try {
    profileRuntimeCounter("pullCalls");

    const base = high;
    let top = base;
    let changed = false;

    scan: while (true) {
      /**
       * If the current node is already Changed, the current dependency edge
       * does not need to be inspected. We are going to bubble anyway.
       */
      if ((node.state & Changed) !== 0) {
        profilePullNode("node.changed", node, top - base, top - base);
        changed = true;
      } else {
        profileRuntimeCounter("pullEdgesVisited");

        const dep = edge.from;
        const depState = dep.state;

        if ((depState & Changed) !== 0) {
          profileRuntimeCounter("pullChangedDeps");
          profileRuntimeCounter("pullAdvanceCalls");
          profilePullNode(
            "dep.changed.advance",
            dep,
            top - base + 1,
            top - base,
          );

          /**
           * advance() may re-enter pull walking, so expose only the active
           * stack slice before calling it.
           */
          high = top;

          if (__DEV__) {
            devAssertRefreshEdge(dep, edge);
          }

          changed = advance(dep, edge);
        } else if ((depState & Invalid) !== 0) {
          profileRuntimeCounter("pullInvalidDeps");

          const firstIn = dep.firstIn;

          if (firstIn !== null) {
            profileRuntimeCounter("pullDescents");
            profilePullNode(
              "dep.invalid.descend",
              dep,
              top - base + 1,
              top - base,
            );

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

          profileRuntimeCounter("pullAdvanceCalls");
          profilePullNode(
            "dep.invalid.leaf.advance",
            dep,
            top - base + 1,
            top - base,
          );

          if (__DEV__) {
            devAssertRefreshEdge(dep, edge);
          }

          changed = advance(dep, edge);
        } else {
          profileRuntimeCounter("pullCleanDeps");
          profilePullNode("dep.clean", dep, top - base + 1, top - base);

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
          profileRuntimeCounter("pullStableSiblingScans");
          profilePullNode(
            "sibling.stable",
            sibling.from,
            top - base + 1,
            top - base,
          );

          edge = sibling;
          continue scan;
        }
      }

      if (changed) {
        while (top !== base) {
          top = top - 1;
          high = top;

          const parentEdge = stack[top]!;
          profileRuntimeCounter("pullChangedBubbles");
          profileRuntimeCounter("pullAdvanceCalls");
          profilePullNode(
            "bubble.changed.advance",
            node,
            top - base + 1,
            top - base,
          );
          changed = advance(node, parentEdge);
          node = parentEdge.to;

          if (!changed) {
            const sibling = parentEdge.nextIn;

            if (sibling !== null) {
              profileRuntimeCounter("pullStableSiblingScans");
              profilePullNode(
                "sibling.after-bubble",
                sibling.from,
                top - base + 1,
                top - base,
              );

              edge = sibling;
              continue scan;
            }

            break;
          }
        }

        if (changed) {
          high = base;
          trimWalkerStackToFloorIfSparse(stack);
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
        node.state &= ~Invalid;
        node = parentEdge.to;

        const sibling = parentEdge.nextIn;

        if (sibling !== null) {
          profileRuntimeCounter("pullStableSiblingScans");
          profilePullNode(
            "sibling.after-stable-pop",
            sibling.from,
            top - base + 1,
            top - base,
          );

          edge = sibling;
          continue scan;
        }
      }

      if (!changed) {
        node.state &= ~Invalid;
      }

      high = base;
      trimWalkerStackToFloorIfSparse(stack);
      return changed;
    }
  } finally {
    if (__DEV__) leaveRuntimePhase();
  }
}

export function readShouldRecomputeStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readRuntimeWalkerStackStats(high, stack.length, 0, 0);
}
