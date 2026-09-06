import { currentConsumer, trackingEpoch } from "@runtime/kernel/state";
import type ReactiveNode from "@runtime/kernel/shape/node";

import { resolveTrackedRead } from "./resolve";

/**
 * Track read for the current active consumer.
 * For test, but not prod
 */
export function trackRead(
  source: ReactiveNode,
  consumer = currentConsumer,
): void {
  if (consumer === null) return;
  resolveTrackedRead(source, consumer, consumer.tailIn?.version ?? trackingEpoch, true);
}
