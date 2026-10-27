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
export function cleanupUnvisitedSources(node: ReactiveNode): void {
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.cleanup.invoke");

  const tail = node.tailIn;
  const edge = tail === null ? node.firstIn : tail.nextIn;

  if (edge === null) {
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.cleanup.skip");
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

  // One cleanup.edge.drop per removed edge, counted here rather than in the
  // shared sweep, which does not know why its caller removes a sequence.
  // PROFILE only.
  if (__PROFILE__) {
    for (
      let current: ReactiveEdge | null = edge;
      current !== null;
      current = current.nextIn
    ) {
      observeRuntimeProjection?.("projection.semantic.cleanup.edge.drop");
    }
  }
  unlinkDetachedIncomingEdgeSequence(edge);
}
