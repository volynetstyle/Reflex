import { INVALID } from "../reactivity/shape";
import { establish_dependencies_add } from "../reactivity/shape/methods/connect";
import ReactiveNode from "../reactivity/shape/ReactiveNode";
import { pullAndRecompute } from "../reactivity/walkers/pullAndRecompute";

/**
 * That`s for signal
 * Read is doing nothing but mark downstream and oriented to upstream for pending updates
 * @param node
 * @returns
 */
// @__INLINE__
export function readProducer<T>(node: ReactiveNode<T>): T {
  establish_dependencies_add(node);

  return node.payload;
}

const enum ConsumerMode {
  LAZY = 1 << 0,
  EAGER = 1 << 2,
}

/**
 * Pull-lazy or eager read for computed nodes.
 *
 * Phase 1 — fast path: node is already Valid → return cached payload.
 * Phase 2 — pull traversal: walk up the graph marking ancestors VISITED,
 *            discovering which producers are actually stale.
 * Phase 3 — recompute: only if still marked INVALID after traversal.
 *            If the new value equals the old one (commitConsumer returns false)
 *            we skip propagate — no downstream invalidation needed.
 */
// @__INLINE__
export function readConsumer<T>(
  node: ReactiveNode<T>,
  mode: ConsumerMode = ConsumerMode.LAZY,
): T {
  if (!(node.runtime & INVALID)) {
    return node.payload;
  } // fast path

  establish_dependencies_add(node);

  pullAndRecompute(node); // фаза 1 + фаза 2 вместо recuperate + recompute

  return node.payload;
}

export const readRecycer = (node: ReactiveNode) => {
  const scope = node.lifecycle;

  if (!scope) {
    throw new Error("Effect must exist on scope or create own");
  }
};
