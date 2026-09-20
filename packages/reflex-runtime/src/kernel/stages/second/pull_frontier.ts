import {
  Changed,
  Computing,
  Unknown,
  Visited,
  type ReactiveEdge,
  type WatcherNode,
} from "@runtime/kernel/shape";

import { advance } from "./advance";
import { pull_iterator } from "./pull_iterator";

/**
 * Validate a watcher's complete committed dependency frontier.
 *
 * Unlike pull_iterator(), this operation is root-oriented: a confirmed change
 * is accumulated locally and does not stop validation of later root siblings.
 * The root's Changed bit is semantic execution evidence, never traversal
 * control. A validation-epoch marker lets propagation record invalidations
 * that would otherwise be hidden by an already-set Unknown bit.
 *
 * Preconditions:
 * - root has Unknown;
 * - root is not Computing.
 *
 * During validation, Computing marks an active consumer epoch and tailIn spans
 * the complete committed frontier. Reentrant invalidation is therefore
 * recorded by the existing push protocol as Visited | Unknown.
 *
 * On success, this function returns whether it confirmed a dependency change.
 * It does not discharge root.Unknown and preserves epoch-local Visited.
 * On failure it additionally commits any already-confirmed Changed evidence.
 * It always restores Computing and the previous incoming cursor. Orthogonal
 * state such as Scheduled remains owned by the scheduler boundary.
 * 
 * best case:   Θ(D)
 *              все deps clean
 * 
 * typical:     Θ(D + dirty slice)
 * 
 * worst case:  O(D + Vu + Eu)
 *              при memoized stabilization
 * 
 * strict bound без такого invarianta:
 *              O(D + Σ traversal(dep_i))
 */
export function pull_frontier(
  root: WatcherNode,
  firstEdge: ReactiveEdge | null,
): boolean {
  const initialState = root.state;
  const previousTail = root.tailIn;

  // Visited on entry belongs to the preceding watcher execution epoch. Turn
  // it into durable execution evidence before reusing Visited as this
  // validation epoch's invalidation marker. Computing plus the committed tail
  // deliberately reuses push's existing rare reentrant-subscriber path, so
  // validation adds no branch to propagation hot paths.
  root.tailIn = root.lastIn;
  root.state =
    (initialState & ~Visited) |
    Computing |
    ((initialState & Visited) !== 0 ? Changed : 0);

  let confirmedChanged = false;
  let completed = false;

  try {
    for (let edge = firstEdge; edge !== null; edge = edge.nextIn) {
      const dependency = edge.from;
      const state = dependency.state;

      if (__DEV__ && (state & Computing) !== 0) {
        throw new Error("Cycle detected while refreshing reactive graph");
      }

      if ((state & Changed) !== 0) {
        if (advance(dependency, edge)) confirmedChanged = true;
        continue;
      }

      if ((state & Unknown) === 0) continue;

      const dependencyEdge = dependency.firstIn;
      if (
        dependencyEdge === null ||
        pull_iterator(dependency, dependencyEdge)
      ) {
        if (advance(dependency, edge)) confirmedChanged = true;
      }
    }

    completed = true;
    return confirmedChanged;
  } finally {
    // Earlier dependencies may already have committed new values. Preserve
    // that monotonic proof so a later successful retry still executes the
    // watcher, while Unknown keeps the frontier retryable.
    if (!completed && confirmedChanged) root.state |= Changed;
    root.state &= ~Computing;
    if (root.compute !== undefined) root.tailIn = previousTail;
  }
}
