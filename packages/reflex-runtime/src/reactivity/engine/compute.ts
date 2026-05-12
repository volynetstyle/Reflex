import type { ReactiveNode } from "../shape";
import { devRecordRecompute } from "../dev";
import { clearDirtyState } from "../shape";
import { executeNodeComputation } from "./execute";
import { defaultContext } from "../context";
import { compare } from "../../protocol/utils/compare";

export function recompute(node: ReactiveNode): boolean {
  const prev = node.payload;
  const next = executeNodeComputation(node);
  const hasChanged = !compare(prev, next);

  node.payload = next;
  clearDirtyState(node);

  devRecordRecompute(node, hasChanged, next, prev, defaultContext);

  return hasChanged;
}
