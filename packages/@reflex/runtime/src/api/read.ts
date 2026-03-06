import recompute from "../reactivity/consumer/recompute";
import { CLEAR_VISITED, INVALID, ReactiveNodeState } from "../reactivity/shape";
import { establish_dependencies_add } from "../reactivity/shape/methods/connect";
import ReactiveNode from "../reactivity/shape/ReactiveNode";
import {
  pullAndRecompute,
} from "../reactivity/walkers/propagateFrontier";

/**
 * That`s for signal
 * Read is doing nothing but mark downstream and oriented to upstream for pending updates
 * @param node
 * @returns
 */
// @__INLINE__
export function readProducer(node: ReactiveNode) {
  establish_dependencies_add(node);

  return node.payload;
}

const STALE = ReactiveNodeState.Invalid | ReactiveNodeState.Obsolete;

/**
 * Pull-lazy read for computed nodes.
 *
 * Phase 1 — fast path: node is already Valid → return cached payload.
 * Phase 2 — pull traversal: walk up the graph marking ancestors VISITED,
 *            discovering which producers are actually stale.
 * Phase 3 — recompute: only if still marked INVALID after traversal.
 *            If the new value equals the old one (commitConsumer returns false)
 *            we skip propagate — no downstream invalidation needed.
 */
// @__INLINE__
export function readConsumer(node: ReactiveNode): unknown {
  establish_dependencies_add(node);

  if (!(node.runtime & STALE)) return node.payload; // fast path

  pullAndRecompute(node); // фаза 1 + фаза 2 вместо recuperate + recompute

  return node.payload;
}