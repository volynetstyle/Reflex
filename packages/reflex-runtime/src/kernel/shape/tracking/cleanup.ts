import type ReactiveNode from "../node";
import type { ReactiveEdge } from "../edge";
import { devRecordCleanupStaleSources } from "../../dev";
import { defaultContext } from "../../context";
import {
  runtimeProfileCounters,
  runtimeProfileCountersEnabled,
} from "../../../profiling";

/**
 * Suffix cleanup over the consumer's incoming edges after recompute.
 *
 * Everything after tailIn belongs to the old dependency list and is unlinked.
 */
export function cleanupUnvisitedSources(node: ReactiveNode): void {
  if (__PROFILE__ && runtimeProfileCountersEnabled) {
    runtimeProfileCounters.cleanupCalls += 1;
  }

  const tail = node.tailIn;
  const staleHead = tail === null ? node.firstIn : tail.nextIn;

  if (staleHead === null) {
    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      runtimeProfileCounters.cleanupSkipped += 1;
    }
    return;
  }

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
    if (__PROFILE__ && runtimeProfileCountersEnabled) {
      runtimeProfileCounters.cleanupEdgesDropped += 1;
    }

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
}
