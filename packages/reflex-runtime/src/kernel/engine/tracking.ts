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

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

function hasTrackedPrefixEdge(
  producer: ReactiveNode,
  cursorEdge: ReactiveEdge,
): boolean {
  for (
    let prefixEdge = cursorEdge.prevIn;
    prefixEdge !== null;
    prefixEdge = prefixEdge.prevIn
  ) {
    if (prefixEdge.from === producer) return true;
  }

  return false;
}

function trackReadSlowPath(
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
 * ```
 * Layered optimistic for tracking read-order reconciliation
 *
 * trackReadResolved
 * ├─ optimistic O(1) cursor/next/lookahead/last checks
 * ├─ small local linked-list reorder
 * ├─ duplicate guards
 * └─ resolveReadFallback
 *       ├─ tiny-list append/link
 *       └─ readTrackingStrategy
 *             └─ reuseIncomingEdgeOrLink
 * ```
 *
 * @param producer
 * @param consumer
 * @param producerVersion
 * @param allowSlowPath
 * @returns
 */
export function trackReadResolved(
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
      if (IS_DEV) devRecordTrackRead(defaultContext, consumer, producer);
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
      if (IS_DEV) devRecordTrackRead(defaultContext, consumer, producer);
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
      /**
       * L2a: Prefix duplicate guard.
       *
       * Avoid creating a duplicate edge when the producer was already read
       * earlier in the current tracking pass.
       */
      if (hasTrackedPrefixEdge(producer, cursorEdge)) {
        if (IS_DEV) devRecordTrackRead(defaultContext, consumer, producer);
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

      if (IS_DEV) devRecordTrackRead(defaultContext, consumer, producer);
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
      if (IS_DEV) devRecordTrackRead(defaultContext, consumer, producer);
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
        if (IS_DEV) devRecordTrackRead(defaultContext, consumer, producer);
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

      if (IS_DEV) devRecordTrackRead(defaultContext, consumer, producer);
      return true;
    }

    /**
     * L6: Prefix duplicate guard.
     *
     * The producer may already exist before the cursor.
     * In that case, this read is already represented by the current graph.
     */
    if (hasTrackedPrefixEdge(producer, cursorEdge)) {
      if (IS_DEV) devRecordTrackRead(defaultContext, consumer, producer);
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

      if (IS_DEV) devRecordTrackRead(defaultContext, consumer, producer);
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

      if (IS_DEV) devRecordTrackRead(defaultContext, consumer, producer);
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

      if (IS_DEV) devRecordTrackRead(defaultContext, consumer, producer);
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
  if (IS_DEV) devRecordTrackRead(defaultContext, consumer, producer);
  trackReadSlowPath(producer, consumer, producerVersion, cursorEdge);
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
  trackReadResolved(source, consumer, trackingEpoch, true);
}

/**
 * Suffix cleanup over the consumer's incoming edges after recompute.
 *
 * Everything after tailIn belongs to the old dependency list and is unlinked.
 */
export function cleanupStaleSources(node: ReactiveNode): void {
  const tail = node.tailIn;
  const staleHead = tail === null ? node.firstIn : tail.nextIn;

  if (staleHead === null) return;

  if (tail === null) {
    node.firstIn = null;
    node.lastIn = null;
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
