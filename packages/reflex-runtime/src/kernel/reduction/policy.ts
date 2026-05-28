import { GraphReductionEnabled, type ReactiveNode } from "../shape";
import { normalizeGraphReductionOptions } from "./options";
import type { GraphReductionOptions } from "./types";

export function setNodeGraphReductionPolicy(
  node: ReactiveNode,
  options: GraphReductionOptions | boolean | undefined,
): void {
  if (
    options !== undefined &&
    normalizeGraphReductionOptions(options).enabled
  ) {
    node.state |= GraphReductionEnabled;
    return;
  }

  node.state &= ~GraphReductionEnabled;
}
