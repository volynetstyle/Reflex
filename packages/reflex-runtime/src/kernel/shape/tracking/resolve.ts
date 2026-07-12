import { defaultContext, readTrackingStrategy } from "@runtime/kernel/config";
import { devRecordTrackRead } from "@runtime/kernel/dev";
import { linkEdge } from "@runtime/kernel/shape/graph";
import {
  moveLastIncomingEdgeAfterEdgeUnchecked,
  moveLastIncomingEdgeToFrontUnchecked,
  moveTrackedIncomingEdgeAfterCursorUnchecked,
} from "@runtime/kernel/shape/graph/edgeList";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { profileRuntimeCounter } from "@runtime/profiling";

import {
  hasProducerEdgeInCurrentPassUnchecked,
  PrefixHit,
  PrefixScanLimitReached,
  scanProducerInTrackedPrefix,
} from "./prefix";

/**
 *
 * Layered optimistic for tracking read-order reconciliation
 *
 * Resolve one tracked producer read against the consumer's incoming edge list.
 *
 * This function is a layered dependency-shape resolver:
 *
 * 1. Static order:
 *    - cursor hit
 *    - next-edge hit
 *    - first-edge hit
 *
 * 2. Append-only growth:
 *    - append after cursor
 *
 * 3. Bounded local reorder:
 *    - one-hop lookahead
 *    - two-hop lookahead
 *    - move last edge to cursor/front
 *
 * 4. Duplicate trace:
 *    - producer already exists in the tracked prefix
 *
 * 5. Dynamic reconciliation:
 *    - delegate to readTrackingStrategy
 *
 * The reached tier is useful for profiling and later statification:
 * stable consumers can be promoted to cheaper tracking modes, while
 * unstable consumers remain on the dynamic policy.
 *
 * resolveTrackedRead
 * ├─ O(1) cursor / next / first checks
 * ├─ append-only growth
 * ├─ bounded linked-list reorder
 * │  ├─ one-hop lookahead
 * │  ├─ two-hop lookahead
 * │  └─ last-edge shortcut
 * ├─ duplicate-prefix guard
 * └─ slow-path strategy fallback
 *
 * The tier reached by a read is useful for profiling and future specialization:
 * stable consumers can be promoted to cheaper tracking modes, while unstable
 * consumers stay on the dynamic reconciliation policy.
 *
 * ```
 * @param producer
 * @param consumer
 * @param producerVersion
 * @param allowSlowPath
 * @returns
 */
export function resolveTrackedRead(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  producerVersion: number,
  allowSlowPath: boolean,
): boolean {
  profileRuntimeCounter("trackingResolveCalls");

  /**
   * `tailIn` is used here as the tracking cursor.
   *
   * It points to the last incoming edge that was successfully matched
   * during the current dependency tracking pass.
   */
  const cursorEdge = consumer.tailIn;

  if (cursorEdge !== null) {
    /**
     * L1: Sequential next-edge hit.
     *
     * The new read order matches the previous dependency order.
     *
     * Example:
     *   old: A -> B -> C
     *   new: A -> B -> C
     */
    const expectedNextEdge = cursorEdge.nextIn;

    if (expectedNextEdge !== null) {
      if (expectedNextEdge.from === producer) {
        expectedNextEdge.version = producerVersion;
        consumer.tailIn = expectedNextEdge;
        profileRuntimeCounter("trackingNextHit");
        if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
        return true;
      }
    }

    /**
     * L0: Cursor hit.
     *
     * Consecutive duplicate reads resolve to the current cursor. Sequential
     * reads are checked first because they dominate stable dependency traces
     * and otherwise pay an always-false cursor producer comparison.
     */
    if (cursorEdge.from === producer) {
      cursorEdge.version = producerVersion;
      profileRuntimeCounter("trackingCursorHit");
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
      return true;
    }

    /**
     * L2: Cursor is at the end.
     *
     * If there is no expected next edge, the dependency is either:
     *   1. already present in the tracked prefix, or
     *   2. a new dependency that should be appended after the cursor.
     */
    if (expectedNextEdge === null) {
      if (producer.firstOut === null) {
        consumer.tailIn = linkEdge(
          producer,
          consumer,
          cursorEdge,
          producerVersion,
        );

        profileRuntimeCounter("trackingAppendAfterCursor");

        if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
        return true;
      }

      /**
       * L2a: Prefix duplicate guard.
       *
       * Avoid creating a duplicate edge when the producer was already read
       * earlier in the current tracking pass.
       */
      const prefixResult = scanProducerInTrackedPrefix(producer, cursorEdge);

      if (prefixResult === PrefixHit) {
        profileRuntimeCounter("trackingPrefixDuplicate");

        if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
        return true;
      }

      if (prefixResult === PrefixScanLimitReached) {
        if (producerVersion !== 0) {
          if (
            hasProducerEdgeInCurrentPassUnchecked(
              producer,
              consumer,
              producerVersion,
            )
          ) {
            profileRuntimeCounter("trackingPrefixDuplicate");

            if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
            return true;
          }
        }
      }

      /**
       * L2b: Append-only growth.
       *
       * The producer was not found in the already-tracked prefix,
       * so this is a new dependency appended after the cursor.
       */
      consumer.tailIn = linkEdge(
        producer,
        consumer,
        cursorEdge,
        producerVersion,
      );

      profileRuntimeCounter("trackingAppendAfterCursor");

      if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
      return true;
    }

    /**
     * L3: One-hop lookahead reorder.
     *
     * The producer is not the expected next edge, but the edge after it.
     *
     * Before:
     *   cursor -> expectedNext -> lookahead1
     *
     * After:
     *   cursor -> lookahead1 -> expectedNext
     */
    const lookahead1Edge = expectedNextEdge.nextIn;

    if (lookahead1Edge !== null) {
      if (__TRACKING_ONE_HOP__ && lookahead1Edge.from === producer) {
        profileRuntimeCounter("trackingOneHopReorder");

        if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);

        return moveTrackedIncomingEdgeAfterCursorUnchecked(
          consumer,
          cursorEdge,
          lookahead1Edge,
          producerVersion,
        );
      }

      /**
       * L4: Two-hop lookahead reorder.
       *
       * The producer is two edges away from the expected next position.
       *
       * Before:
       *   cursor -> expectedNext -> lookahead1 -> lookahead2
       *
       * After:
       *   cursor -> lookahead2 -> expectedNext -> lookahead1
       */
      if (__TRACKING_TWO_HOP__) {
        const lookahead2Edge = lookahead1Edge.nextIn;

        if (lookahead2Edge !== null && lookahead2Edge.from === producer) {
          profileRuntimeCounter("trackingTwoHopReorder");

          if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);

          return moveTrackedIncomingEdgeAfterCursorUnchecked(
            consumer,
            cursorEdge,
            lookahead2Edge,
            producerVersion,
          );
        }
      }
    }

    /**
     * L5: Last-edge shortcut.
     *
     * If the producer is the last incoming edge, move it after the cursor
     * without scanning the whole list.
     */
    if (__TRACKING_LAST_EDGE__) {
      const lastIncomingEdge = consumer.lastIn;

      if (lastIncomingEdge !== null && lastIncomingEdge.from === producer) {
        profileRuntimeCounter("trackingLastEdgeShortcut");

        moveLastIncomingEdgeAfterEdgeUnchecked(
          consumer,
          lastIncomingEdge,
          cursorEdge,
        );

        lastIncomingEdge.version = producerVersion;
        consumer.tailIn = lastIncomingEdge;

        if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
        return true;
      }
    }

    /**
     * L6: Prefix duplicate guard.
     *
     * The producer may already exist before the cursor.
     * In that case, this read is already represented by the current graph.
     */
    const prefixResult = scanProducerInTrackedPrefix(producer, cursorEdge);

    if (prefixResult === PrefixHit) {
      profileRuntimeCounter("trackingPrefixDuplicate");

      if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
      return true;
    }

    if (prefixResult === PrefixScanLimitReached) {
      if (producerVersion !== 0) {
        if (
          hasProducerEdgeInCurrentPassUnchecked(
            producer,
            consumer,
            producerVersion,
          )
        ) {
          profileRuntimeCounter("trackingPrefixDuplicate");

          if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
          return true;
        }
      }
    }
  } else {
    /**
     * Initial tracking state.
     *
     * There is no cursor yet, so this is the first dependency resolution
     * of the current tracking pass.
     */
    const firstIncomingEdge = consumer.firstIn;

    /**
     * I0: Empty dependency list.
     *
     * No previous incoming dependencies exist, so create the first edge.
     */
    if (firstIncomingEdge === null) {
      consumer.tailIn = linkEdge(producer, consumer, null, producerVersion);

      profileRuntimeCounter("trackingInitialCreate");

      if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
      return true;
    }

    /**
     * I1: First-edge hit.
     *
     * The first previous dependency matches the first current read.
     */
    if (firstIncomingEdge.from === producer) {
      firstIncomingEdge.version = producerVersion;
      consumer.tailIn = firstIncomingEdge;

      profileRuntimeCounter("trackingInitialFirstHit");

      if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
      return true;
    }

    /**
     * I2: Last-edge shortcut from initial cursor state.
     *
     * The first current read was previously the last dependency.
     * Move it to the front.
     */
    if (__TRACKING_LAST_EDGE__) {
      const lastIncomingEdge = consumer.lastIn;

      if (lastIncomingEdge !== null && lastIncomingEdge.from === producer) {
        profileRuntimeCounter("trackingInitialLastEdgeShortcut");

        moveLastIncomingEdgeToFrontUnchecked(consumer, lastIncomingEdge);

        lastIncomingEdge.version = producerVersion;
        consumer.tailIn = lastIncomingEdge;

        if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
        return true;
      }
    }
  }

  if (!allowSlowPath) {
    profileRuntimeCounter("trackingSlowPathBlocked");
    return false;
  }

  /**
   * L7b / I4: Full slow-path reconciliation.
   *
   * The optimistic fast paths could not resolve the read locally.
   * Delegate to the general dependency reconciliation logic.
   */
  if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);

  profileRuntimeCounter("trackingSlowPath");

  consumer.tailIn = readTrackingStrategy(
    producer,
    consumer,
    cursorEdge,
    cursorEdge === null ? consumer.firstIn : cursorEdge.nextIn,
    producerVersion,
  );

  return true;
}
