// Analysis-only cleanup policies for the cross-epoch retention study, applied
// by scripts/build-baseline-oracle.mjs --mutate to an archived copy of the
// sources; the checked-out sources are never changed.
//
//   retain-one-epoch
//               design (a), the upper bound of causal cost: cleanup keeps a
//               suffix edge that the previous pass read and marks it retained
//               (stamp 0, never a pass stamp); an edge already retained once
//               is unlinked. A retained edge stays fully attached and active:
//               propagation marks through it and validation walks it. A
//               reread retained producer is the sequential next edge, so it
//               is reused without a lookup. Breaks the oracle's exact
//               dependency invariant by design.
//
//   retain-identity
//               design (b), identity without authority. Cleanup still takes
//               every unread suffix edge out of the producer's outgoing list
//               and out of the consumer's incoming list, so while the
//               consumer is idle no propagation and no validation sees it.
//               An edge the previous pass read is not destroyed: it is
//               marked retained (stamp -1, never a pass stamp) and chained
//               through its own free nextIn field, and the chain head goes to
//               the consumer's idle tailIn slot (a third lifetime-disjoint
//               reading next to the residual edge and the outgoing hint; a
//               hint fill overwrites it and the chain is simply dropped).
//               When the consumer's next computation starts, at the point
//               where it clears tailIn, the chain is appended to the end of
//               both lists as an ordinary unvisited suffix, causally inert
//               while the pass runs (preserve-until-cleanup), so tracking
//               reuses a reread edge through its existing paths. Edges
//               retained once and not read again are dropped at the next
//               cleanup. Watcher validation runs before the computation, so
//               it never sees retained edges. A computation that throws
//               skips cleanup, so its catch drops the retained edges the
//               failed pass did not read.
const RETAIN_CLEANUP =
  'let retainedHead = null; let retainedLast = null; for (let current = edge; current !== null; ) {   const next = current.nextIn; const from = current.from; const prevOut = current.prevOut; const nextOut = current.nextOut;   if (from.tailIn === current) from.tailIn = null;   if (prevOut !== null) prevOut.nextOut = nextOut; else from.firstOut = nextOut;   if (nextOut !== null) nextOut.prevOut = prevOut; else from.lastOut = prevOut;   current.prevOut = null; current.nextOut = null; current.prevIn = null; current.nextIn = null;   if (current.stamp === -1) { if (__PROFILE__) observeRuntimeProjection?.("projection.semantic.cleanup.edge.drop"); }   else { current.stamp = -1; if (retainedLast === null) retainedHead = current; else retainedLast.nextIn = current; retainedLast = current; if (__PROFILE__) globalThis.__srRetained = (globalThis.__srRetained | 0) + 1; }   current = next; } if (retainedHead !== null) node.tailIn = retainedHead;';
const REATTACH =
  "const retained = node.tailIn; node.tailIn = null; if (retained !== null && retained.stamp === -1 && retained.to === node) {   for (let e = retained; e !== null; ) {     const next = e.nextIn; const lastIn = node.lastIn;     e.prevIn = lastIn; e.nextIn = null;     if (lastIn === null) node.firstIn = e; else lastIn.nextIn = e;     node.lastIn = e;     const from = e.from; const lastOut = from.lastOut;     e.prevOut = lastOut; e.nextOut = null;     if (lastOut === null) from.firstOut = e; else lastOut.nextOut = e;     from.lastOut = e;     if (__PROFILE__) globalThis.__srReattached = (globalThis.__srReattached | 0) + 1;     e = next;   } }";

// A computation that throws skips cleanup: drop the retained edges it did
// not read, so the failed pass leaves the graph of the baseline.
const DROP_ON_THROW =
  "for (let e = node.tailIn === null ? node.firstIn : node.tailIn.nextIn; e !== null; ) {   const next = e.nextIn;   if (e.stamp === -1) {     const prevIn = e.prevIn; if (prevIn !== null) prevIn.nextIn = next; else node.firstIn = next;     if (next !== null) next.prevIn = prevIn; else node.lastIn = prevIn;     const from = e.from; const prevOut = e.prevOut; const nextOut = e.nextOut;     if (from.tailIn === e) from.tailIn = null;     if (prevOut !== null) prevOut.nextOut = nextOut; else from.firstOut = nextOut;     if (nextOut !== null) nextOut.prevOut = prevOut; else from.lastOut = prevOut;     e.prevIn = null; e.nextIn = null; e.prevOut = null; e.nextOut = null;   }   e = next; }";

export const retentionVariants = {
  "retain-one-epoch": [
    'src/kernel/stages/tracking/cleanup.ts::import { unlinkDetachedIncomingEdgeSequence } from "@runtime/kernel/shape/graph/sweepEdges";::import { unlinkDetachedIncomingEdgeSequence } from "@runtime/kernel/shape/graph/sweepEdges"; import { unlinkEdge } from "@runtime/kernel/shape/graph/linkEdge";',
    "src/kernel/stages/tracking/cleanup.ts::  if (tail === null) {::  if (true) { } else if (tail === null) {",
    'src/kernel/stages/tracking/cleanup.ts::        observeRuntimeProjection?.("projection.semantic.cleanup.edge.drop");::        void 0;',
    'src/kernel/stages/tracking/cleanup.ts::  unlinkDetachedIncomingEdgeSequence(edge);::  for (let current = edge; current !== null; ) { const next = current.nextIn; if (current.stamp === 0) { if (__PROFILE__) observeRuntimeProjection?.("projection.semantic.cleanup.edge.drop"); unlinkEdge(current); } else current.stamp = 0; current = next; }',
  ],
  "retain-identity": [
    'src/kernel/stages/tracking/cleanup.ts::        observeRuntimeProjection?.("projection.semantic.cleanup.edge.drop");::        void 0;',
    `src/kernel/stages/tracking/cleanup.ts::  unlinkDetachedIncomingEdgeSequence(edge);::  ${RETAIN_CLEANUP}`,
    `src/kernel/stages/stabilization/advance.ts::  node.tailIn = null;::  ${REATTACH}`,
    `src/kernel/engine/watcher.execution.ts::  node.tailIn = null;::  ${REATTACH}`,
    `src/kernel/stages/stabilization/advance.ts::    devRecordComputeError(node, error, defaultContext);::    ${DROP_ON_THROW} devRecordComputeError(node, error, defaultContext);`,
    `src/kernel/engine/watcher.execution.ts::    devRecordComputeError(node, error, defaultContext);::    ${DROP_ON_THROW} devRecordComputeError(node, error, defaultContext);`,
  ],
};
