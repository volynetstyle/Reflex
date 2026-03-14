
function evaluate(node: ReactiveNode): void {
  const prevSources = node.sources;
  node.sources = [];
  node.sourceVersions = [];
  trackingContext = node;
  let newValue: unknown;
  
  try {
    newValue = node.branch
      ? recomputeConditional(node.branch) // Opt 4
      : node.compute!();
  } finally {
    trackingContext = null;
  }

  reconcileEdges(node, prevSources);
  // Rank correction: проверить после reconcile
  let maxSrcRank = -1;
  for (const src of node.sources)
    if (src.rank > maxSrcRank) maxSrcRank = src.rank;
  if (maxSrcRank >= node.rank) {
    node.rank = maxSrcRank + 1;
    propagateRankDown(node); // O(subgraph), amortized O(1)/edge
    node.flags |= NodeFlags.DIRTY;
    node._scheduledRank = node.rank;
    queue.push(node);
    return; // результат отбрасывается
  }
  const changed = !Object.is(newValue, node.value);
  node.value = newValue;
  node.flags = NodeFlags.CLEAN;
  if (changed) {
    node.version++;
    for (const obs of node.observers)
      obs.flags = (obs.flags & ~NodeFlags.CHECK) | NodeFlags.DIRTY;
  }
}
