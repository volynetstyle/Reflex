import { defaultContext } from "@runtime/kernel/config";
import { devRecordCleanupStaleSources } from "@runtime/kernel/dev";
import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { unlinkDetachedIncomingEdgeSequence } from "@runtime/kernel/shape/graph/sweepEdges";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

/**
 * Remove the unvisited suffix after a successful pass.
 *
 * Every incoming edge after the cursor `tailIn` belongs to the previous
 * dependency list and was not read by this pass, so it is cut from the
 * incoming list and unlinked from its producer. This is the only place where
 * a pass removes edges: reconciliation moves or links and never unlinks.
 */
export function cleanupUnvisitedSources(consumer: ReactiveNode): void {
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.cleanup.invoke");

  const cursorEdge = consumer.tailIn;
  const firstUnvisitedEdge =
    cursorEdge === null ? consumer.firstIn : cursorEdge.nextIn;

  if (firstUnvisitedEdge === null) {
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.cleanup.skip");
    return;
  }

  if (cursorEdge === null) {
    consumer.firstIn = null;
    consumer.lastIn = null;
  } else {
    cursorEdge.nextIn = null;
    consumer.lastIn = cursorEdge;
  }

  devRecordCleanupStaleSources(consumer, firstUnvisitedEdge, defaultContext);

  // One cleanup.edge.drop per removed edge, counted here rather than in the
  // shared sweep, which does not know why its caller removes a sequence.
  // PROFILE only.
  if (__PROFILE__) {
    for (
      let unvisitedEdge: ReactiveEdge | null = firstUnvisitedEdge;
      unvisitedEdge !== null;
      unvisitedEdge = unvisitedEdge.nextIn
    ) {
      observeRuntimeProjection?.("projection.semantic.cleanup.edge.drop");
    }
  }
  unlinkDetachedIncomingEdgeSequence(firstUnvisitedEdge);
}
