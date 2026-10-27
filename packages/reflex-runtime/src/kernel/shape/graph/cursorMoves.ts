import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";

// Incoming-list moves of the tracking tiers (stages/tracking/resolve.ts):
// each moves an edge next to the tracking cursor `tailIn` of a computing
// consumer. Generic moves are in ./edgeList.ts.
//
// "Unchecked": the preconditions listed on each function are the caller's
// responsibility and are not verified.

/**
 * Move the incoming tail of `consumer` right after the tracking cursor, stamp
 * it with the pass stamp and make it the cursor: the last-edge tier of
 * resolveCursorTrackedReadMiss.
 *
 * Preconditions:
 * - `lastIncomingEdge` is `consumer.lastIn`, `previousLastEdge` its `prevIn`
 * - `expectedNextEdge` is `cursorEdge.nextIn`, not null
 * - `previousLastEdge !== cursorEdge` (the tail is not already next)
 */
export function moveLastIncomingEdgeAfterCursorUnchecked(
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge,
  expectedNextEdge: ReactiveEdge,
  lastIncomingEdge: ReactiveEdge,
  previousLastEdge: ReactiveEdge,
  passStamp: number,
): void {
  previousLastEdge.nextIn = null;
  consumer.lastIn = previousLastEdge;

  lastIncomingEdge.prevIn = cursorEdge;
  lastIncomingEdge.nextIn = expectedNextEdge;
  lastIncomingEdge.stamp = passStamp;

  cursorEdge.nextIn = lastIncomingEdge;
  expectedNextEdge.prevIn = lastIncomingEdge;
  consumer.tailIn = lastIncomingEdge;
}

/**
 * Move the last incoming edge to the head: the last-edge shortcut of the
 * initial read (resolveInitialTrackedReadMiss), which also stamps it and
 * makes it the cursor.
 *
 * Preconditions:
 * - edge.nextIn === null
 * - edge.prevIn !== null
 */
export function moveLastIncomingEdgeToFrontUnchecked(
  to: ReactiveNode,
  edge: ReactiveEdge,
): void {
  const prev = edge.prevIn!;

  prev.nextIn = null;
  to.lastIn = prev;

  const first = to.firstIn!;

  edge.prevIn = null;
  edge.nextIn = first;
  first.prevIn = edge;

  to.firstIn = edge;
}

/**
 * Move a lookahead edge right after the tracking cursor, stamp it with the
 * pass stamp and make it the cursor: the one-hop and two-hop tiers of
 * resolveCursorTrackedReadMiss.
 *
 *   cursor -> expectedNext -> ... -> movedEdge
 *
 * becomes
 *
 *   cursor -> movedEdge -> expectedNext -> ...
 *
 * Preconditions:
 * - cursorEdge.nextIn !== null
 * - movedEdge.prevIn !== null
 * - movedEdge comes after cursorEdge.nextIn
 * - all edges are in the incoming list of `consumer`
 *
 * Returns `true`; callers do not use the value.
 */
export function moveTrackedIncomingEdgeAfterCursorUnchecked(
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge,
  movedEdge: ReactiveEdge,
  passStamp: number,
): true {
  const expectedNextEdge = cursorEdge.nextIn!;
  const previousMovedEdge = movedEdge.prevIn!;
  const afterMovedEdge = movedEdge.nextIn;

  previousMovedEdge.nextIn = afterMovedEdge;

  if (afterMovedEdge !== null) {
    afterMovedEdge.prevIn = previousMovedEdge;
  } else {
    consumer.lastIn = previousMovedEdge;
  }

  movedEdge.prevIn = cursorEdge;
  movedEdge.nextIn = expectedNextEdge;

  cursorEdge.nextIn = movedEdge;
  expectedNextEdge.prevIn = movedEdge;

  movedEdge.stamp = passStamp;
  consumer.tailIn = movedEdge;

  return true;
}
