import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";

// Generic moves within one node's incoming list: internal exports for tests,
// benchmarks and graph tools; the runtime does not call them. The moves of
// the tracking tiers are in ./cursorMoves.ts. Outgoing lists are never
// reordered.
//
// "Unchecked": the preconditions listed on each function are the caller's
// responsibility and are not verified.

/**
 * Move `edge` after `after` in the incoming list of `to`, or to its head
 * when `after` is null. A no-op when the edge is already there.
 *
 * Preconditions:
 * - `edge` is in the incoming list of `to`
 * - `after` is null or in the same list
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
 * Move an incoming edge that is neither head nor tail after another edge.
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
 * Move a non-head incoming edge to the head.
 *
 * Preconditions:
 * - edge.prevIn !== null
 * - `edge` is in the incoming list of `to`
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
 * Move the last incoming edge after another edge; a no-op when it is already
 * there.
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
