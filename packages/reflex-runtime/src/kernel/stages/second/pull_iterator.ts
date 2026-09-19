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
import { isRuntimeProfilingEnabled } from "@runtime/profiling";
import {
  observeRuntimeProjection,
  observeRuntimeProjectionAmount,
  observeRuntimePullPath,
} from "@runtime/kernel/projection";

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
    if (__PROFILE__)
      observeRuntimePullPath?.(
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
  if (__PROFILE__) {
    observeRuntimeProjection?.("projection.semantic.pull.invoke");
  }

  const base = high;
  let top = base;
  let changed = false;

  try {
    scan: while (true) {
      while (true) {
        const nodeState = node.state;

        if ((nodeState & Changed) !== 0) {
          if (__PROFILE__) {
            profilePullNode("node.changed", node, top - base, top - base);
          }
          changed = true;
          break;
        }

        if (__PROFILE__) {
          observeRuntimeProjection?.("projection.semantic.pull.edge.visit");
        }

        const dep = edge.from;
        const state = dep.state;

        if (__DEV__ && (state & Computing) !== 0) {
          throw new Error("Cycle detected while refreshing reactive graph");
        }

        const dirty = state & (Changed | Unknown);
        const depChanged = (dirty & Changed) !== 0;

        if (dirty !== 0) {
          if (!depChanged) {
            if (__PROFILE__) {
              observeRuntimeProjection?.(
                "projection.semantic.pull.dependency.invalid",
              );
            }

            const firstIn = dep.firstIn;

            if (firstIn !== null) {
              if (__PROFILE__) {
                observeRuntimeProjection?.("projection.semantic.pull.descend");
                profilePullNode(
                  "dep.unknown.descend",
                  dep,
                  top - base + 1,
                  top - base,
                );
              }

              stack[top++] = edge;

              if (__DEV__) {
                noteShouldRecomputeStackUsage(top);
              }

              node = dep;
              edge = firstIn;
              continue scan;
            }
          }

          if (__PROFILE__) {
            if (depChanged) {
              observeRuntimeProjection?.(
                "projection.semantic.pull.dependency.changed",
              );
            }
            observeRuntimeProjection?.(
              "projection.semantic.pull.advance.invoke",
            );
            profilePullNode(
              depChanged ? "dep.changed.advance" : "dep.unknown.leaf.advance",
              dep,
              top - base + 1,
              top - base,
            );
          }

          /**
           * advance() may re-enter pull walking, so publish this invocation's
           * live continuation frontier before user code runs.
           */
          high = top;

          if (__DEV__) {
            devAssertRefreshEdge(dep, edge);
          }

          if (advance(dep, edge)) {
            changed = true;
            break;
          }

          /**
           * Read the continuation only after advance(): user code may have
           * mutated the incoming list. Reuse this one read for both the parent
           * guard and the sibling transition.
           */
          const sibling = edge.nextIn;

          if (sibling !== null && (node.state & Changed) !== 0) {
            changed = true;
            break;
          }

          if (sibling === null) {
            changed = false;
            break;
          }

          if (__PROFILE__) {
            observeRuntimeProjection?.(
              "projection.semantic.pull.sibling.stable-scan",
            );
            profilePullNode(
              "sibling.stable",
              sibling.from,
              top - base + 1,
              top - base,
            );
          }

          edge = sibling;
          continue;
        }

        if (__PROFILE__) {
          observeRuntimeProjection?.(
            "projection.semantic.pull.dependency.clean",
          );
          profilePullNode("dep.clean", dep, top - base + 1, top - base);
        }

        const sibling = edge.nextIn;
        if (sibling === null) {
          changed = false;
          break;
        }

        if (__PROFILE__) {
          observeRuntimeProjection?.(
            "projection.semantic.pull.sibling.stable-scan",
          );
          profilePullNode(
            "sibling.stable",
            sibling.from,
            top - base + 1,
            top - base,
          );
        }

        edge = sibling;
      }

      /** Bubble / stable-resume phase. */
      while (top !== base) {
        const parentEdge = stack[--top]!;
        stack[top] = null!;
        high = top;

        if (changed) {
          if (__PROFILE__) {
            observeRuntimeProjection?.(
              "projection.semantic.pull.changed.bubble",
            );
            observeRuntimeProjection?.(
              "projection.semantic.pull.advance.invoke",
            );
            profilePullNode(
              "bubble.changed.advance",
              node,
              top - base + 1,
              top - base,
            );
          }

          changed = advance(node, parentEdge);
        } else {
          node.state &= ~Unknown;
        }

        node = parentEdge.to;

        if (!changed) {
          const sibling = parentEdge.nextIn;

          if (sibling !== null) {
            if (__PROFILE__) {
              observeRuntimeProjection?.(
                "projection.semantic.pull.sibling.stable-scan",
              );
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
      }

      if (!changed) {
        node.state &= ~Unknown;
      }

      return changed;
    }
  } finally {
    while (top !== base) {
      stack[--top] = null!;
    }

    high = base;

    if (base === 0 && stack.length > STACK_TRIM_MIN_CAPACITY) {
      if (__PROFILE__) {
        if (__PROFILE__)
          observeRuntimeProjection?.("projection.semantic.pull.stack.trim");
        if (__PROFILE__)
          observeRuntimeProjectionAmount?.(
            "projection.semantic.pull.stack.trim.excess",
            stack.length - STACK_TRIM_MIN_CAPACITY,
          );
      }

      stack.length = STACK_TRIM_MIN_CAPACITY;
    }
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
