import { DEFAULT_GRAPH_REDUCTION_OPTIONS } from "../reduction";
import { reuseIncomingEdgeFromSuffixOrCreate } from "../shape/graph";
import type { ReadTrackingStrategy, RuntimeDebugContext } from "./types";

export { DEFAULT_GRAPH_REDUCTION_OPTIONS };

export const DEFAULT_READ_TRACKING_STRATEGY: ReadTrackingStrategy =
  reuseIncomingEdgeFromSuffixOrCreate;

export const defaultContext: RuntimeDebugContext = {
  scope: "runtime",
};
