import type ReactiveNode from "../shape/node";
import { nodeStructureIncrement } from "../shape/node";
import { devRecordCleanupStaleSources, devRecordTrackRead } from "../dev";
import { linkEdge } from "../shape/graph";
import {
  moveLastIncomingEdgeAfterEdgeUnchecked,
  moveLastIncomingEdgeToFrontUnchecked,
} from "../shape/graph/edgeList";
import {
  currentConsumer,
  defaultContext,
  trackingEpoch,
  readTrackingStrategy,
} from "../context";
import type { ReactiveEdge } from "../shape";

function hasProducerInTrackedPrefix(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  cursorEdge: ReactiveEdge,
  producerVersion: number,
): boolean {
  let scannedPrefixEdges = 0;

  for (
    let prefixEdge = cursorEdge.prevIn;
    prefixEdge !== null;
    prefixEdge = prefixEdge.prevIn
  ) {
    if (prefixEdge.from === producer) return true;

    scannedPrefixEdges += 1;
    if (scannedPrefixEdges < 32 || producerVersion === 0) continue;

    for (let edge = producer.firstOut; edge !== null; edge = edge.nextOut) {
      if (edge.to === consumer && edge.version === producerVersion) {
        return true;
      }
    }

    return false;
  }

  return false;
}

export const Failed = 1 << 0;
export const CursorHit = 1 << 1;
export const NextHit = 1 << 2;
export const Append = 1 << 3;
export const LocalReorder = 1 << 4;
export const PrefixDuplicate = 1 << 5;
export const Fallback = 1 << 6;

function resolveTrackedReadFallback(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  producerVersion: number,
  cursorEdge: ReactiveNode["tailIn"],
): void {
  if (cursorEdge === null) {
    const firstIncomingEdge = consumer.firstIn;

    if (firstIncomingEdge === null || firstIncomingEdge.nextIn === null) {
      consumer.tailIn = linkEdge(producer, consumer, null, producerVersion);
      return;
    }

    consumer.tailIn = readTrackingStrategy(
      producer,
      consumer,
      null,
      firstIncomingEdge,
      producerVersion,
    );
    return;
  }

  const expectedNextEdge = cursorEdge.nextIn;

  if (expectedNextEdge === null || expectedNextEdge.nextIn === null) {
    consumer.tailIn = linkEdge(producer, consumer, cursorEdge, producerVersion);
    return;
  }

  consumer.tailIn = readTrackingStrategy(
    producer,
    consumer,
    cursorEdge,
    expectedNextEdge,
    producerVersion,
  );
}

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
 * ├─ optimistic O(1) cursor/next/lookahead/last checks
 * ├─ small local linked-list reorder
 * ├─ duplicate guards
 * └─ resolveReadFallback
 *       ├─ tiny-list append/link
 *       └─ readTrackingStrategy
 *             └─ reuseIncomingEdgeOrLink
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
  /**
   * `tailIn` is used here as the tracking cursor.
   *
   * It points to the last incoming edge that was successfully matched
   * during the current dependency tracking pass.
   */
  const cursorEdge = consumer.tailIn;

  if (cursorEdge !== null) {
    /**
     * L0: Cursor hit.
     *
     * The current read resolves to the same dependency as the current cursor.
     * This is the cheapest possible case.
     */
    if (cursorEdge.from === producer) {
      cursorEdge.version = producerVersion;
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
      return true;
    }

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

    if (expectedNextEdge !== null && expectedNextEdge.from === producer) {
      expectedNextEdge.version = producerVersion;
      consumer.tailIn = expectedNextEdge;
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

        if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
        return true;
      }

      /**
       * L2a: Prefix duplicate guard.
       *
       * Avoid creating a duplicate edge when the producer was already read
       * earlier in the current tracking pass.
       */
      if (
        hasProducerInTrackedPrefix(
          producer,
          consumer,
          cursorEdge,
          producerVersion,
        )
      ) {
        if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
        return true;
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

    if (lookahead1Edge !== null && lookahead1Edge.from === producer) {
      const afterMovedEdge = lookahead1Edge.nextIn;

      expectedNextEdge.nextIn = afterMovedEdge;

      if (afterMovedEdge !== null) {
        afterMovedEdge.prevIn = expectedNextEdge;
      } else {
        consumer.lastIn = expectedNextEdge;
      }

      cursorEdge.nextIn = lookahead1Edge;
      lookahead1Edge.prevIn = cursorEdge;

      lookahead1Edge.nextIn = expectedNextEdge;
      expectedNextEdge.prevIn = lookahead1Edge;

      lookahead1Edge.version = producerVersion;
      consumer.tailIn = lookahead1Edge;

      nodeStructureIncrement(consumer);
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
      return true;
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
    if (lookahead1Edge !== null) {
      const lookahead2Edge = lookahead1Edge.nextIn;

      if (lookahead2Edge !== null && lookahead2Edge.from === producer) {
        const afterMovedEdge = lookahead2Edge.nextIn;

        lookahead1Edge.nextIn = afterMovedEdge;

        if (afterMovedEdge !== null) {
          afterMovedEdge.prevIn = lookahead1Edge;
        } else {
          consumer.lastIn = lookahead1Edge;
        }

        cursorEdge.nextIn = lookahead2Edge;
        lookahead2Edge.prevIn = cursorEdge;

        lookahead2Edge.nextIn = expectedNextEdge;
        expectedNextEdge.prevIn = lookahead2Edge;

        lookahead2Edge.version = producerVersion;
        consumer.tailIn = lookahead2Edge;

        nodeStructureIncrement(consumer);
        if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
        return true;
      }
    }

    /**
     * L5: Last-edge shortcut.
     *
     * If the producer is the last incoming edge, move it after the cursor
     * without scanning the whole list.
     */
    const lastIncomingEdge = consumer.lastIn;

    if (lastIncomingEdge !== null && lastIncomingEdge.from === producer) {
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

    /**
     * L6: Prefix duplicate guard.
     *
     * The producer may already exist before the cursor.
     * In that case, this read is already represented by the current graph.
     */
    if (
      hasProducerInTrackedPrefix(
        producer,
        consumer,
        cursorEdge,
        producerVersion,
      )
    ) {
      if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
      return true;
    }

    /**
     * L7a: Optimistic path failed and slow path is disabled.
     */
    if (!allowSlowPath) return false;
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

      if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
      return true;
    }

    /**
     * I2: Last-edge shortcut from initial cursor state.
     *
     * The first current read was previously the last dependency.
     * Move it to the front.
     */
    const lastIncomingEdge = consumer.lastIn;

    if (lastIncomingEdge !== null && lastIncomingEdge.from === producer) {
      moveLastIncomingEdgeToFrontUnchecked(consumer, lastIncomingEdge);

      lastIncomingEdge.version = producerVersion;
      consumer.tailIn = lastIncomingEdge;

      if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
      return true;
    }

    /**
     * I3: Initial optimistic path failed and slow path is disabled.
     */
    if (!allowSlowPath) return false;
  }

  /**
   * L7b / I4: Full slow-path reconciliation.
   *
   * The optimistic fast paths could not resolve the read locally.
   * Delegate to the general dependency reconciliation logic.
   */
  if (__DEV__) devRecordTrackRead(defaultContext, consumer, producer);
  resolveTrackedReadFallback(producer, consumer, producerVersion, cursorEdge);
  return true;
}

/**
 * Track read for the current active consumer.
 *
 */
export function trackRead(
  source: ReactiveNode,
  consumer = currentConsumer,
): void {
  if (consumer === null) return;
  resolveTrackedRead(source, consumer, trackingEpoch, true);
}

/**
 * Suffix cleanup over the consumer's incoming edges after recompute.
 *
 * Everything after tailIn belongs to the old dependency list and is unlinked.
 */
export function cleanupUnvisitedSources(node: ReactiveNode): void {
  const tail = node.tailIn;
  const staleHead = tail === null ? node.firstIn : tail.nextIn;

  if (staleHead === null) return;

  if (tail === null) {
    node.firstIn = node.lastIn = null;
  } else {
    tail.nextIn = null;
    node.lastIn = tail;
  }

  if (__DEV__) {
    devRecordCleanupStaleSources(node, staleHead, defaultContext);
  }

  let edge: ReactiveEdge | null = staleHead;

  do {
    const nextIn: ReactiveEdge | null = edge.nextIn;

    const from = edge.from;
    const prevOut = edge.prevOut;
    const nextOut = edge.nextOut;

    if (prevOut !== null) {
      prevOut.nextOut = nextOut;
    } else {
      from.firstOut = nextOut;
    }

    if (nextOut !== null) {
      nextOut.prevOut = prevOut;
    } else {
      from.lastOut = prevOut;
    }

    edge.prevOut = edge.nextOut = edge.prevIn = edge.nextIn = null;

    edge = nextIn;
  } while (edge !== null);

  nodeStructureIncrement(node);
}
