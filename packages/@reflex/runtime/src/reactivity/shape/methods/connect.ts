import { clearReactiveEdgeLinks, ReactiveEdge } from "../ReactiveEdge";
import { isDisposedNode, markDisposedNode } from "../ReactiveMeta";
import type ReactiveNode from "../ReactiveNode";
import { UNINITIALIZED } from "../ReactiveNode";

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Insert `edge` into `to`'s incoming list right after `after` (or at head). */
function attachInEdge(
  to: ReactiveNode,
  edge: ReactiveEdge,
  after: ReactiveEdge | null,
): void {
  const next = after ? after.nextIn : to.firstIn;

  edge.prevIn = after;
  edge.nextIn = next;

  if (next) next.prevIn = edge;
  else to.lastIn = edge;
  if (after) after.nextIn = edge;
  else to.firstIn = edge;
}

/** Splice `edge` out of `to`'s incoming list (does NOT touch the out-list). */
function detachInEdge(to: ReactiveNode, edge: ReactiveEdge): void {
  const { prevIn, nextIn } = edge;
  if (prevIn) prevIn.nextIn = nextIn;
  else to.firstIn = nextIn;
  if (nextIn) nextIn.prevIn = prevIn;
  else to.lastIn = prevIn;
}

/** Splice `edge` out of `from`'s outgoing list (does NOT touch the in-list). */
function detachOutEdge(from: ReactiveNode, edge: ReactiveEdge): void {
  const { prevOut, nextOut } = edge;
  if (prevOut) prevOut.nextOut = nextOut;
  else from.firstOut = nextOut;
  if (nextOut) nextOut.prevOut = prevOut;
  else from.lastOut = prevOut;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function linkEdge(
  from: ReactiveNode,
  to: ReactiveNode,
  after: ReactiveEdge | null = to.lastIn,
  version = 0,
): ReactiveEdge {
  const prevOut = from.lastOut;
  const nextIn = after ? after.nextIn : to.firstIn;
  const edge = new ReactiveEdge(
    version,
    prevOut,
    null,
    from,
    to,
    after,
    nextIn,
  );

  if (prevOut) prevOut.nextOut = edge;
  else from.firstOut = edge;
  from.lastOut = edge;

  if (nextIn) nextIn.prevIn = edge;
  else to.lastIn = edge;
  if (after) after.nextIn = edge;
  else to.firstIn = edge;

  return edge;
}

export function unlinkEdge(edge: ReactiveEdge): void {
  const { from, to } = edge;

  if (to.depsTail === edge) to.depsTail = edge.prevIn;

  detachOutEdge(from, edge);
  detachInEdge(to, edge);

  clearReactiveEdgeLinks(edge);
}

/**
 * Reuses an existing edge from `from → to` if possible, repositioning it
 * after `prev` when needed. Falls back to creating a new edge.
 */
export function reuseIncomingEdgeFromSuffixOrCreate(
  from: ReactiveNode,
  to: ReactiveNode,
  prev: ReactiveEdge | null,
  nextExpected: ReactiveEdge | null,
  version = 0,
): ReactiveEdge {
  // Scan the remaining suffix for a reusable edge.
  // `nextExpected` already points at the first still-available edge after the
  // reused prefix, so the fallback scan must include it.
  for (
    let edge = nextExpected ?? to.firstIn;
    edge !== null;
    edge = edge.nextIn
  ) {
    if (edge.from !== from) continue;

    // Found one — reposition it if it's out of order.
    if (edge.prevIn !== prev) {
      detachInEdge(to, edge);
      attachInEdge(to, edge, prev);
    }

    edge.version = version;
    return edge;
  }

  return linkEdge(from, to, prev, version);
}

export function unlinkDetachedIncomingEdgeSequence(
  edge: ReactiveEdge | null,
): void {
  while (edge) {
    const next = edge.nextIn;
    detachOutEdge(edge.from, edge);
    clearReactiveEdgeLinks(edge);
    edge = next;
  }
}

/**
 * Full incoming-edge sweep used by disposal paths.
 * Cold-path traversal that tears down every source connection.
 */
export function unlinkAllSources(node: ReactiveNode): void {
  let edge = node.firstIn;

  // Clear node's bookkeeping up-front so unlinkEdge's detachInEdge calls
  // operate on a clean slate (each will become a no-op on the in-list).
  node.firstIn = node.lastIn = node.depsTail = null;

  while (edge) {
    const next = edge.nextIn;
    detachOutEdge(edge.from, edge);
    clearReactiveEdgeLinks(edge);
    edge = next;
  }
}

export function moveIncomingEdgeAfter(
  edge: ReactiveEdge,
  to: ReactiveNode,
  after: ReactiveEdge | null,
): void {
  if (edge.prevIn === after) return;
  if (after === null && to.firstIn === edge) return;

  detachInEdge(to, edge);
  attachInEdge(to, edge, after);
}

/**
 * Full outgoing-edge sweep used by producer disposal paths.
 * Cold-path traversal that tears down every subscriber connection.
 */
export function unlinkAllSubscribers(node: ReactiveNode): void {
  let edge = node.firstOut;

  node.firstOut = node.lastOut = null;

  while (edge) {
    const next = edge.nextOut;

    if (edge.to.depsTail === edge) edge.to.depsTail = edge.prevIn;
    detachInEdge(edge.to, edge);
    clearReactiveEdgeLinks(edge);
    edge = next;
  }
}

/** Cold-path: links `parent → child` only if not already connected. */
export function connect(
  parent: ReactiveNode,
  child: ReactiveNode,
): ReactiveEdge {
  const depsTail = child.lastIn;

  if (depsTail !== null && depsTail.from === parent) {
    return depsTail;
  }

  for (let e = depsTail; e; e = e.prevIn) {
    if (e.from === parent) return e;
  }

  return linkEdge(parent, child);
}

/** Cold-path: removes the first `parent → child` edge if it exists. */
export function disconnect(parent: ReactiveNode, child: ReactiveNode): void {
  for (let e = child.firstIn; e; e = e.nextIn) {
    if (e.from === parent) {
      unlinkEdge(e);
      return;
    }
  }
}

export function disposeNode(node: ReactiveNode): void {
  if (isDisposedNode(node)) return;
  markDisposedNode(node);
  node.depsTail = null;
  unlinkAllSources(node);
  unlinkAllSubscribers(node);
  node.compute = null;
  node.payload = UNINITIALIZED;
}

export function disposeNodeEvent(node: ReactiveNode): void {
  disposeNode(node);
}
