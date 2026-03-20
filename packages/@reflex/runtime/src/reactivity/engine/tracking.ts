import runtime from "../context";
import type ReactiveNode from "../shape/ReactiveNode";
import type { ReactiveEdge } from "../shape/ReactiveEdge";
import { reuseOrCreateIncomingEdge, unlinkEdge } from "../shape/methods/connect";

/**
 * Cursor-guided incoming-edge walk used during dependency collection.
 * It first probes the hot cache and expected next edge, then falls back to a
 * linear scan that reorders the found edge into the reused dependency prefix.
 */
export function trackRead(source: ReactiveNode): void {
  const consumer = runtime.activeComputed;

  if (!consumer) return;

  const prevEdge = consumer.depsTail;
  const nextExpected = prevEdge !== null ? prevEdge.nextIn : consumer.firstIn;
  const edge = reuseOrCreateIncomingEdge(
    source,
    consumer,
    prevEdge,
    nextExpected,
  );

  consumer.depsTail = edge;
}

/**
 * Suffix cleanup over the consumer's incoming edges after recompute.
 * Everything after depsTail belongs to the old dependency list and is unlinked.
 */
export function cleanupStaleSources(node: ReactiveNode): void {
  const tail = node.depsTail;
  let edge: ReactiveEdge | null = tail !== null ? tail.nextIn : node.firstIn;

  while (edge) {
    const next: ReactiveEdge | null = edge.nextIn;
    unlinkEdge(edge);
    edge = next;
  }
}
