import type ReactiveNode from "../node";
import { currentConsumer, trackingEpoch } from "../../context";
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
  resolveTrackedRead(source, consumer, trackingEpoch, true);
}
