import { defaultContext } from "@runtime/kernel/config";
import { devRecordCleanupStaleSources } from "@runtime/kernel/dev";
import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { unlinkDetachedIncomingEdgeSequence } from "@runtime/kernel/shape/graph/sweepEdges";
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
  const edge = tail === null ? node.firstIn : tail.nextIn;

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

  // Preserve the existing counter without making the shared graph sweep
  // interpret why its caller removed this sequence. Absent in production.
  if (__PROFILE__) {
    for (let current: ReactiveEdge | null = edge; current !== null; current = current.nextIn) {
      profileRuntimeCounter("cleanupEdgesDropped");
    }
  }
  unlinkDetachedIncomingEdgeSequence(edge);
}
