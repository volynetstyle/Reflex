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
//
//   lazy-identity
//               design (c), lazy reactivation. A cold node field, retainedIn,
//               holds the edges the last cleanup took out of both lists, in
//               their old read order, chained through nextIn. Nothing returns
//               to the lists at the next computation: a read that misses the
//               active edges in a cold path (initial, tail or cursor miss)
//               first compares the chain head with its producer and, on a
//               match, splices that edge in at the cursor and at the end of
//               the producer's outgoing list, with no lookup and no
//               allocation. Any cold-path link of a new edge abandons the
//               chain, so a chained producer never also has an active edge
//               (no duplicate pair without a lookup); the hot first-edge
//               link is safe because a chain is kept only while the incoming
//               list is nonempty (cleanup and the unlink paths clear it).
//               The next cleanup replaces the chain: unreactivated edges
//               expire with no list work. Dispose clears it.
//   lazy-identity-strict
//               lazy-identity with expiry at the end of every computation
//               (one store on the computation's exit path), so identity
//               outlives membership by exactly one consumer epoch.
//   lazy-identity-shared-at-drop
//               lazy-identity that retains a dropped edge only when its
//               producer keeps another subscriber after the unlink. At that
//               moment retention extends no lifetime, but not afterwards: if
//               the other subscribers later drop the producer too, the
//               retained edge, absent from the producer's outgoing list, still
//               keeps it alive (memory.mjs orphaned-*). Formerly called
//               lazy-identity-neutral.
const RETAIN_CLEANUP =
  'let retainedHead = null; let retainedLast = null; for (let current = edge; current !== null; ) {   const next = current.nextIn; const from = current.from; const prevOut = current.prevOut; const nextOut = current.nextOut;   if (from.tailIn === current) from.tailIn = null;   if (prevOut !== null) prevOut.nextOut = nextOut; else from.firstOut = nextOut;   if (nextOut !== null) nextOut.prevOut = prevOut; else from.lastOut = prevOut;   current.prevOut = null; current.nextOut = null; current.prevIn = null; current.nextIn = null;   if (current.stamp === -1) { if (__PROFILE__) observeRuntimeProjection?.("projection.semantic.cleanup.edge.drop"); }   else { current.stamp = -1; if (retainedLast === null) retainedHead = current; else retainedLast.nextIn = current; retainedLast = current; if (__PROFILE__) globalThis.__srRetained = (globalThis.__srRetained | 0) + 1; }   current = next; } if (retainedHead !== null) node.tailIn = retainedHead;';
const REATTACH =
  "const retained = node.tailIn; node.tailIn = null; if (retained !== null && retained.stamp === -1 && retained.to === node) {   for (let e = retained; e !== null; ) {     const next = e.nextIn; const lastIn = node.lastIn;     e.prevIn = lastIn; e.nextIn = null;     if (lastIn === null) node.firstIn = e; else lastIn.nextIn = e;     node.lastIn = e;     const from = e.from; const lastOut = from.lastOut;     e.prevOut = lastOut; e.nextOut = null;     if (lastOut === null) from.firstOut = e; else lastOut.nextOut = e;     from.lastOut = e;     if (__PROFILE__) globalThis.__srReattached = (globalThis.__srReattached | 0) + 1;     e = next;   } }";

// A computation that throws skips cleanup: drop the retained edges it did
// not read, so the failed pass leaves the graph of the baseline.
const DROP_ON_THROW =
  "for (let e = node.tailIn === null ? node.firstIn : node.tailIn.nextIn; e !== null; ) {   const next = e.nextIn;   if (e.stamp === -1) {     const prevIn = e.prevIn; if (prevIn !== null) prevIn.nextIn = next; else node.firstIn = next;     if (next !== null) next.prevIn = prevIn; else node.lastIn = prevIn;     const from = e.from; const prevOut = e.prevOut; const nextOut = e.nextOut;     if (from.tailIn === e) from.tailIn = null;     if (prevOut !== null) prevOut.nextOut = nextOut; else from.firstOut = nextOut;     if (nextOut !== null) nextOut.prevOut = prevOut; else from.lastOut = prevOut;     e.prevIn = null; e.nextIn = null; e.prevOut = null; e.nextOut = null;   }   e = next; }";

// Design (c): lazy reactivation. Shared by lazy-identity and its strict form.
const LAZY_CLEANUP =
  'if (__PROFILE__) { for (let old = node.retainedIn; old !== null; old = old.nextIn) observeRuntimeProjection?.("projection.semantic.cleanup.edge.drop"); } let retainedHead = null; let retainedLast = null; for (let current = edge; current !== null; ) {   const next = current.nextIn; const from = current.from; const prevOut = current.prevOut; const nextOut = current.nextOut;   if (from.tailIn === current) from.tailIn = null;   if (prevOut !== null) prevOut.nextOut = nextOut; else from.firstOut = nextOut;   if (nextOut !== null) nextOut.prevOut = prevOut; else from.lastOut = prevOut;   current.prevOut = null; current.nextOut = null; current.prevIn = null; current.nextIn = null;   if (tail !== null) { if (retainedLast === null) retainedHead = current; else retainedLast.nextIn = current; retainedLast = current; if (__PROFILE__) globalThis.__srRetained = (globalThis.__srRetained | 0) + 1; }   else if (__PROFILE__) observeRuntimeProjection?.("projection.semantic.cleanup.edge.drop");   current = next; } node.retainedIn = retainedHead;';
const REACTIVATE_FRONT =
  "{ const retained = consumer.retainedIn; if (retained !== null && retained.from === producer) { consumer.retainedIn = retained.nextIn; retained.prevIn = null; retained.nextIn = firstIncomingEdge; firstIncomingEdge.prevIn = retained; consumer.firstIn = retained; const lastOut = producer.lastOut; retained.prevOut = lastOut; retained.nextOut = null; if (lastOut === null) producer.firstOut = retained; else lastOut.nextOut = retained; producer.lastOut = retained; retained.stamp = passStamp; consumer.tailIn = retained; if (__PROFILE__) globalThis.__srReactivated = (globalThis.__srReactivated | 0) + 1; return; } }";
const REACTIVATE_TAIL =
  "{ const retained = consumer.retainedIn; if (retained !== null && retained.from === producer) { consumer.retainedIn = retained.nextIn; retained.prevIn = cursorEdge; retained.nextIn = null; cursorEdge.nextIn = retained; consumer.lastIn = retained; const lastOut = producer.lastOut; retained.prevOut = lastOut; retained.nextOut = null; if (lastOut === null) producer.firstOut = retained; else lastOut.nextOut = retained; producer.lastOut = retained; retained.stamp = passStamp; consumer.tailIn = retained; if (__PROFILE__) globalThis.__srReactivated = (globalThis.__srReactivated | 0) + 1; return; } }";
const REACTIVATE_INNER =
  "{ const retained = consumer.retainedIn; if (retained !== null && retained.from === producer) { consumer.retainedIn = retained.nextIn; retained.prevIn = cursorEdge; retained.nextIn = expectedNextEdge; cursorEdge.nextIn = retained; expectedNextEdge.prevIn = retained; const lastOut = producer.lastOut; retained.prevOut = lastOut; retained.nextOut = null; if (lastOut === null) producer.firstOut = retained; else lastOut.nextOut = retained; producer.lastOut = retained; retained.stamp = passStamp; consumer.tailIn = retained; if (__PROFILE__) globalThis.__srReactivated = (globalThis.__srReactivated | 0) + 1; return; } }";
const LAZY = [
  "src/kernel/shape/node.ts::  tailIn: ReactiveEdge | null = null;::  tailIn: ReactiveEdge | null = null; retainedIn: ReactiveEdge | null = null;",
  'src/kernel/stages/tracking/cleanup.ts::        observeRuntimeProjection?.("projection.semantic.cleanup.edge.drop");::        void 0;',
  `src/kernel/stages/tracking/cleanup.ts::  unlinkDetachedIncomingEdgeSequence(edge);::  ${LAZY_CLEANUP}`,
  `src/kernel/stages/tracking/resolve.ts::  // The prefix is empty: whatever the lookup finds is in the suffix. The::  ${REACTIVATE_FRONT}
  // The prefix is empty: whatever the lookup finds is in the suffix. The`,
  `src/kernel/stages/tracking/resolve.ts::  // With the cursor at lastIn, any edge of the pair is in the tracked prefix::  ${REACTIVATE_TAIL}
  // With the cursor at lastIn, any edge of the pair is in the tracked prefix`,
  `src/kernel/stages/tracking/resolve.ts::  // Exact lookup. The cursor and the expected next edge were compared by::  ${REACTIVATE_INNER}
  // Exact lookup. The cursor and the expected next edge were compared by`,
  "src/kernel/shape/graph/linkEdge.ts::  const nextIn = after === null ? to.firstIn : after.nextIn;::  const nextIn = after === null ? to.firstIn : after.nextIn; to.retainedIn = null;",
  "src/kernel/shape/graph/linkEdge.ts::  cursor.nextIn = edge;::  cursor.nextIn = edge; to.retainedIn = null;",
  "src/kernel/shape/graph/linkEdge.ts::  else to.lastIn = prevIn;::  else to.lastIn = prevIn; if (to.firstIn === null) to.retainedIn = null;",
  "src/kernel/shape/graph/sweepEdges.ts::    else to.lastIn = prevIn;::    else to.lastIn = prevIn; if (to.firstIn === null) to.retainedIn = null;",
  "src/kernel/shape/graph/sweepEdges.ts::export function unlinkAllSources(node: ReactiveNode): void {::export function unlinkAllSources(node: ReactiveNode): void { node.retainedIn = null;",
];
// Shared-at-drop retention: keep a dropped edge only while its producer still
// has another subscriber, so retention extends no lifetime at that moment.
const LAZY_NEUTRAL_CLEANUP = LAZY_CLEANUP.replace(
  "if (tail !== null) {",
  "if (tail !== null && from.firstOut !== null) {",
);
const STRICT_EXPIRY =
  "if (__PROFILE__) { for (let old = node.retainedIn; old !== null; old = old.nextIn) globalThis.__srExpired = (globalThis.__srExpired | 0) + 1; } node.retainedIn = null;";

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
  "lazy-identity": LAZY,
  "lazy-identity-strict": [
    ...LAZY,
    `src/kernel/stages/stabilization/advance.ts::  if (node.tailIn !== node.lastIn) {::  ${STRICT_EXPIRY} if (node.tailIn !== node.lastIn) {`,
    `src/kernel/engine/watcher.execution.ts::  if (node.tailIn !== node.lastIn) {::  ${STRICT_EXPIRY} if (node.tailIn !== node.lastIn) {`,
  ],
  "lazy-identity-shared-at-drop": LAZY.map((m) =>
    m.includes(LAZY_CLEANUP)
      ? m.replace(LAZY_CLEANUP, LAZY_NEUTRAL_CLEANUP)
      : m,
  ),
};
