import { GraphEdge } from "@reflex/core";
import { NodeCausal } from "../shape/ReactiveMeta";
import ReactiveNode from "../shape/ReactiveNode";
import { beginComputation, endComputation } from "../../execution";

// @__INLINE__
export function isStale(e: GraphEdge, mask: NodeCausal): boolean {
  const src = e.from as ReactiveNode;

  if (mask & NodeCausal.Versioned && e.seenV !== src.v) return true;

  if (mask & NodeCausal.TimeLocked && e.seenT !== src.root.t) return true;

  return false;
}

export function isNodeStale(node: ReactiveNode): boolean {
  for (let e = node.firstIn; e; e = e.nextIn) {
    if (isStale(e, node.meta)) {
      return true;
    }

    const src = e.from as ReactiveNode;
    if (src.compute && isNodeStale(src)) {
      return true;
    }
  }

  return false;
}

// @__INLINE__
export function updateSeen(e: GraphEdge, mask: NodeCausal) {
  const src = e.from as ReactiveNode;

  if (mask & NodeCausal.Versioned) e.seenV = src.v;
  if (mask & NodeCausal.TimeLocked) e.seenT = src.t;
  if (mask & NodeCausal.Structural) e.seenS = src.s;
}

export function recompute(node: ReactiveNode) {
  beginComputation(node);

  node.payload = node.compute!();
  node.v++;

  // Only update edges if causal features are enabled
  const mask = node.meta;
  const currentTime = node.root.t;

  for (let e = node.firstIn; e; e = e.nextIn) {
    const src = e.from as ReactiveNode;

    // Only write if value changed (reduce memory pressure)
    if (mask & NodeCausal.Versioned) {
      if (e.seenV !== src.v) e.seenV = src.v;
    }

    if (mask & NodeCausal.TimeLocked) {
      if (e.seenT !== currentTime) e.seenT = currentTime;
    }
  }

  endComputation();
}
