import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";

/**
 * Generic incoming-edge move.
 *
 * Preconditions:
 * - edge belongs to to.in list
 * - after is null or belongs to the same to.in list
 * - after !== edge
 */
export function moveIncomingEdgeAfterUnchecked(
  to: ReactiveNode,
  edge: ReactiveEdge,
  after: ReactiveEdge | null,
): void {
  if (edge === after || edge.prevIn === after) return;

  const prev = edge.prevIn;
  const next = edge.nextIn;

  if (prev !== null) prev.nextIn = next;
  else to.firstIn = next;

  if (next !== null) next.prevIn = prev;
  else to.lastIn = prev;

  const insertNext = after !== null ? after.nextIn : to.firstIn;

  edge.prevIn = after;
  edge.nextIn = insertNext;

  if (insertNext !== null) insertNext.prevIn = edge;
  else to.lastIn = edge;

  if (after !== null) after.nextIn = edge;
  else to.firstIn = edge;
}

/**
 * Move a middle incoming edge after another edge.
 *
 * Preconditions:
 * - edge.prevIn !== null
 * - edge.nextIn !== null
 * - after !== edge
 * - after belongs to the same incoming list
 * - edge.prevIn !== after
 */
export function moveMiddleIncomingEdgeAfterEdgeUnchecked(
  to: ReactiveNode,
  edge: ReactiveEdge,
  after: ReactiveEdge,
): void {
  const prev = edge.prevIn!;
  const next = edge.nextIn!;

  prev.nextIn = next;
  next.prevIn = prev;

  const insertNext = after.nextIn;

  edge.prevIn = after;
  edge.nextIn = insertNext;

  if (insertNext !== null) insertNext.prevIn = edge;
  else to.lastIn = edge;

  after.nextIn = edge;
}

/**
 * Move a non-head incoming edge to the front.
 *
 * Preconditions:
 * - edge.prevIn !== null
 * - edge belongs to to.in list
 */
export function moveNonHeadIncomingEdgeToFrontUnchecked(
  to: ReactiveNode,
  edge: ReactiveEdge,
): void {
  const prev = edge.prevIn!;
  const next = edge.nextIn;

  prev.nextIn = next;

  if (next !== null) next.prevIn = prev;
  else to.lastIn = prev;

  const first = to.firstIn!;

  edge.prevIn = null;
  edge.nextIn = first;
  first.prevIn = edge;

  to.firstIn = edge;
}

/**
 * Move the last incoming edge after another edge.
 *
 * Preconditions:
 * - edge.nextIn === null
 * - edge.prevIn !== null
 * - after !== edge
 * - after belongs to the same incoming list
 */
export function moveLastIncomingEdgeAfterEdgeUnchecked(
  to: ReactiveNode,
  edge: ReactiveEdge,
  after: ReactiveEdge,
): void {
  if (edge.prevIn === after) return;

  const prev = edge.prevIn!;

  prev.nextIn = null;
  to.lastIn = prev;

  const insertNext = after.nextIn!;

  edge.prevIn = after;
  edge.nextIn = insertNext;

  insertNext.prevIn = edge;

  after.nextIn = edge;
}

/**
 * Moves the physical incoming tail after the tracking cursor and advances it.
 * All structural checks must be performed by the caller.
 */
export function moveLastIncomingEdgeAfterCursorUnchecked(
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge,
  expectedNextEdge: ReactiveEdge,
  lastIncomingEdge: ReactiveEdge,
  previousLastEdge: ReactiveEdge,
  producerVersion: number,
): void {
  previousLastEdge.nextIn = null;
  consumer.lastIn = previousLastEdge;

  lastIncomingEdge.prevIn = cursorEdge;
  lastIncomingEdge.nextIn = expectedNextEdge;
  lastIncomingEdge.version = producerVersion;

  cursorEdge.nextIn = lastIncomingEdge;
  expectedNextEdge.prevIn = lastIncomingEdge;
  consumer.tailIn = lastIncomingEdge;
}

/**
 * Move the last incoming edge to the front.
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
 * Moves an already-known lookahead edge directly after the tracking cursor.
 *
 * Used ONLY by L3/L4 bounded reorder paths:
 *
 *   cursor -> expectedNext -> ... -> movedEdge
 *
 * becomes:
 *
 *   cursor -> movedEdge -> expectedNext -> ...
 *
 * Preconditions:
 * - cursorEdge.nextIn !== null
 * - movedEdge.prevIn !== null
 * - movedEdge appears after cursorEdge
 * - movedEdge !== cursorEdge.nextIn
 * - all edges belong to consumer's incoming list
 *
 */
export function moveTrackedIncomingEdgeAfterCursorUnchecked(
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge,
  movedEdge: ReactiveEdge,
  producerVersion: number,
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

  movedEdge.version = producerVersion;
  consumer.tailIn = movedEdge;

  return true;
}
