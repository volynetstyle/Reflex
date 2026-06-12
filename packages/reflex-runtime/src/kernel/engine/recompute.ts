import type { ReactiveNode } from "../shape";
import {
  devAssertExecutableNode,
  devRecordComputeError,
  devRecordComputeFinish,
  devRecordComputeStart,
  devRecordRecompute,
} from "../dev";
import {
  Computing,
  DIRTY_STATE,
  Visited,
} from "../shape";
import {
  nextTrackingEpoch,
  currentConsumer,
  defaultContext,
  setCurrentConsumer,
} from "../context";
import { compare } from "../../protocol/utils/compare";
import { cleanupUnvisitedSources } from "./tracking";

export function recompute(node: ReactiveNode): boolean {
  // #region DEV validation

  if (__DEV__) devAssertExecutableNode(node);

  // #endregion

  // #region Prepare compute function

  const compute = node.compute as NonNullable<typeof node.compute>;

  // #endregion

  // #region Enter recomputation state

  /**
   * Reset dependency tracking cursor before executing the computation.
   *
   * `tailIn` marks the last confirmed incoming dependency during tracking.
   * Everything after it may become stale and can be cleaned up after compute.
   */
  node.tailIn = null;

  /**
   * Mark node as currently computing.
   *
   * `Visited` is cleared because this recomputation resolves the previous
   * traversal marker. `Computing` protects against re-entrant reads/writes
   * and allows propagation logic to detect an active recompute.
   */
  node.state = (node.state & ~Visited) | Computing;

  /**
   * Advance global tracking epoch so reads inside `compute()` can be associated
   * with the current tracking pass.
   */
  nextTrackingEpoch();

  // #endregion

  // #region Activate dependency tracking context

  /**
   * Save previous active consumer to support nested computations.
   *
   * While `compute()` runs, every tracked producer read should connect to
   * this node as a dependency.
   */
  const prevActive = currentConsumer;
  setCurrentConsumer(node);

  if (__DEV__) devRecordComputeStart(node, defaultContext);

  // #endregion

  // #region Execute computation

  let next: unknown;

  try {
    next = compute();
  } catch (error) {
    /**
     * Restore global tracking state before rethrowing.
     *
     * Without this, one failed computation could poison the whole runtime.
     * Very dramatic, very JavaScript.
     */
    setCurrentConsumer(prevActive);
    node.state &= ~Computing;

    if (__DEV__) devRecordComputeError(node, error, defaultContext);

    throw error;
  }

  // #endregion

  // #region Exit computation state

  /**
   * Restore previous active consumer after successful computation.
   */
  setCurrentConsumer(prevActive);

  /**
   * Clear Computing flag now that node execution is finished.
   */
  node.state &= ~Computing;

  // #endregion

  // #region Cleanup stale dependencies

  /**
   * If the confirmed dependency prefix does not reach the previous last edge,
   * then some old dependencies were not read during this pass and must be
   * detached from the incoming dependency list.
   */
  if (node.tailIn !== node.lastIn) {
    cleanupUnvisitedSources(node);
  }

  // #endregion

  // #region Finalize computed value

  if (__DEV__) devRecordComputeFinish(node, next, defaultContext);

  const prev = node.payload;
  const hasChanged = !compare(prev, next);

  /**
   * Store the new computed value.
   */
  node.payload = next;

  /**
   * Clear dirty flags after recomputation has resolved this node.
   *
   * Whether downstream nodes should be promoted depends on `hasChanged`,
   * which is returned to the caller.
   */
  node.state &= ~DIRTY_STATE;

  if (__DEV__) {
    devRecordRecompute(node, hasChanged, next, prev, defaultContext);
  }

  // #endregion

  // #region Result

  /**
   * `true` means the payload changed and dependents may need promotion.
   * `false` means the node was dirty/invalid but stabilized to the same value.
   */
  return hasChanged;

  // #endregion
}
