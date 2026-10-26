import { defaultContext } from "@runtime/kernel/config";
import {
  enterConsumerTracking,
  restoreConsumerTracking,
} from "@runtime/kernel/state";
import {
  devAssertExecutableNode,
  devAssertRefreshEdge,
  devRecordComputeError,
  devRecordComputeFinish,
  devRecordComputeStart,
  devRecordRecompute,
} from "@runtime/kernel/dev";
import {
  enterRuntimePhase,
  leaveRuntimePhase,
  RuntimePhase,
} from "@runtime/kernel/execution";
import {
  Changed,
  Computing,
  Both,
  Unknown,
  Visited,
  type ReactiveEdge,
  type ReactiveNode,
} from "@runtime/kernel/shape";
import { cleanupUnvisitedSources } from "@runtime/kernel/stages/tracking";
import { push_iterator_once } from "@runtime/kernel/stages/propagation";
import { observeRuntimeProjection } from "@runtime/kernel/projection";

/**
 * Recompute equality, `Object.is`. Writes compare with their own copy
 * (`sameWrittenValue`, protocol/write.producer.ts), so the two sites keep
 * separate type feedback.
 */
export const compare = Object.is;

/**
 * Advance to next value
 *
 * Recompute `node` and, if it changed, propagate dirtiness to its outgoing users.
 *
 * The active pull walker owns the current parent edge; this only propagates
 * side-fanout that existed before recompute.
 */
function advanceCore(
  node: ReactiveNode,
  skipOutEdge: ReactiveEdge | null = null,
): boolean {
  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.advance.invoke");

  devAssertExecutableNode(node);

  const compute = node.compute as NonNullable<typeof node.compute>;
  node.tailIn = null;

  const computingState = (node.state & ~Visited) | Computing;
  node.state = computingState;

  const prevActive = enterConsumerTracking(node);

  devRecordComputeStart(node, defaultContext);

  let next: unknown;

  try {
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.advance.compute.run");

    next = compute();
  } catch (error) {
    restoreConsumerTracking(prevActive);
    // A failed pull-bubble computation may have entered as Unknown after its
    // dependencies already stabilized. Retrying must execute the callback.
    node.state = (computingState & ~(Computing | Unknown)) | Changed;

    devRecordComputeError(node, error, defaultContext);

    throw error;
  }

  restoreConsumerTracking(prevActive);

  const resolvedState = computingState & ~(Computing | Both);

  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.advance.cleanup.check");

  if (node.tailIn !== node.lastIn) {
    node.state = computingState & ~Computing;
    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.advance.cleanup.run");
    cleanupUnvisitedSources(node);
  }

  devRecordComputeFinish(node, next, defaultContext);

  const prev = node.payload;

  // JIT: `compare` is Object.is and returns a boolean. `=== true` compiles to
  // one reference compare instead of a generic ToBoolean on the call result.
  if (compare(prev, next) === true) {
    node.state = resolvedState;

    if (__PROFILE__)
      observeRuntimeProjection?.("projection.semantic.advance.value.unchanged");

    if (__DEV__) devRecordRecompute(node, false, next, prev, defaultContext);
    return false;
  }

  node.payload = next;
  node.state = resolvedState;

  if (__PROFILE__)
    observeRuntimeProjection?.("projection.semantic.advance.value.changed");

  if (__DEV__) devRecordRecompute(node, true, next, prev, defaultContext);

  const firstOut = node.firstOut;

  if (firstOut !== null) {
    if (__PROFILE__)
      observeRuntimeProjection?.(
        "projection.semantic.advance.propagate.invoke",
      );

    devAssertRefreshEdge(node, firstOut);
    if (skipOutEdge === null) {
      push_iterator_once(firstOut, null);
    } else if (firstOut !== skipOutEdge || skipOutEdge.nextOut !== null) {
      if (__PROFILE__)
        observeRuntimeProjection?.(
          "projection.semantic.advance.propagate.skip-edge",
        );
      push_iterator_once(firstOut, skipOutEdge);
    } else if (__PROFILE__) {
      observeRuntimeProjection?.(
        "projection.semantic.advance.propagate.owned-edge-only-skip",
      );
    }
  }

  return true;
}

export const advance: (
  node: ReactiveNode,
  skipOutEdge?: ReactiveEdge | null,
) => boolean = __DEV__
  ? function advanceDev(node, skipOutEdge = null): boolean {
      enterRuntimePhase(RuntimePhase.Recomputing);

      try {
        return advanceCore(node, skipOutEdge);
      } finally {
        leaveRuntimePhase();
      }
    }
  : advanceCore;
