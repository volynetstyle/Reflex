import { defaultContext } from "@runtime/kernel/config";
import { devRecordCleanupStaleSources } from "@runtime/kernel/dev";
import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { profileRuntimeCounter } from "@runtime/profiling";

/**
 * Suffix cleanup over the consumer's incoming edges after recompute.
 *
 * Everything after tailIn belongs to the old dependency list and is unlinked.
 */
export function cleanupUnvisitedSources(node: ReactiveNode): void {
  profileRuntimeCounter("cleanupCalls");

  const tail = node.tailIn;
  let edge = tail === null ? node.firstIn : tail.nextIn;

  if (edge === null) {
    profileRuntimeCounter("cleanupSkipped");
    return;
  }

  if (tail === null) {
    node.firstIn = null;
    node.lastIn = null;
  } else {
    tail.nextIn = null;
    node.lastIn = tail;
  }

  devRecordCleanupStaleSources(node, edge, defaultContext);

  do {
    profileRuntimeCounter("cleanupEdgesDropped");
    const next: ReactiveEdge | null = edge.nextIn;
    const prevOut = edge.prevOut;
    const nextOut = edge.nextOut;
    const from = edge.from;

    if (prevOut !== null) prevOut.nextOut = nextOut;
    else from.firstOut = nextOut;

    if (nextOut !== null) nextOut.prevOut = prevOut;
    else from.lastOut = prevOut;

    edge.prevOut = null;
    edge.nextOut = null;
    edge.prevIn = null;
    edge.nextIn = null;
    edge = next;
  } while (edge !== null);
}
