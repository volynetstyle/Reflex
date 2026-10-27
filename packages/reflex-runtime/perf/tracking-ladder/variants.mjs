// Analysis-only source mutations for the tracking ladder, applied by
// scripts/build-baseline-oracle.mjs --mutate to an archived copy of the
// sources; the checked-out sources are never changed.
//
//   hint-after  consult the producer's hint after the four-link outgoing
//               head start, as before 2026-10-25. Same answers and the same
//               slot fills, so only the order of existing probes changes.
//   eager-detach
//               the reconciliation policy removed on 2026-10-25, restored as a
//               counterfactual: when a new edge is linked in front of an
//               unvisited suffix of at least 32 edges (and the producer has
//               subscribers or the stamp is 0), unlink the whole suffix at
//               once. Later reads of its producers link new edges. It prices
//               preserve-until-cleanup and explains the mechanism (A/B);
//               it is not a semantic mutant: the two policies differ only in
//               edge identity and adjacency order.
//   rotate      when reconciliation reuses a suffix edge, splice the skipped
//               unvisited block (suffix head .. edge.prevIn) behind the
//               physical tail instead of moving the edge forward. Accepted
//               prefix after every read and the graph after every completed
//               pass are unchanged; only the order of the unvisited suffix
//               differs mid-pass, and therefore after a pass that throws.
const ROTATE = [
  "function rotateUnvisitedBlockBehindTail(consumer, edge, insertAfterEdge) {",
  "  const head = insertAfterEdge === null ? consumer.firstIn : insertAfterEdge.nextIn;",
  "  if (head === edge) return;",
  "  const tail = edge.prevIn; const last = consumer.lastIn;",
  "  if (insertAfterEdge === null) consumer.firstIn = edge; else insertAfterEdge.nextIn = edge;",
  "  edge.prevIn = insertAfterEdge;",
  "  last.nextIn = head; head.prevIn = last; tail.nextIn = null; consumer.lastIn = tail;",
  "}",
].join(" ");

const EAGER_DETACH = [
  "if (suffixStartEdge !== null && (passStamp === 0 || producer.firstOut !== null)) {",
  "  let run = suffixStartEdge; let seen = 0;",
  "  while (run !== null && seen < 32) { run = run.nextIn; seen++; }",
  "  if (seen === 32) {",
  '    if (__PROFILE__) observeRuntimeProjection?.("projection.semantic.tracking.suffix.detach");',
  "    if (insertAfterEdge === null) { consumer.firstIn = null; consumer.lastIn = null; }",
  "    else { insertAfterEdge.nextIn = null; consumer.lastIn = insertAfterEdge; }",
  "    suffixStartEdge.prevIn = null;",
  "    unlinkDetachedIncomingEdgeSequence(suffixStartEdge);",
  "  }",
  "}",
].join(" ");

export const variants = {
  "hint-after": [
    "src/kernel/shape/graph/findEdge.ts::  const hint = producer.tailIn;::  const hint = null;",
    "src/kernel/shape/graph/findEdge.ts::  const edge = findEdgeInLockstepPastHeadStart(::  const lateHint = producer.tailIn; if (lateHint !== null && lateHint.to === consumer && lateHint.from === producer) return lateHint; const edge = findEdgeInLockstepPastHeadStart(",
  ],
  "eager-detach": [
    'src/kernel/shape/graph/reuseEdge.ts::import { linkEdge } from "./linkEdge";::import { linkEdge } from "./linkEdge"; import { unlinkDetachedIncomingEdgeSequence } from "./sweepEdges";',
    `src/kernel/shape/graph/reuseEdge.ts::  return linkEdge(producer, consumer, insertAfterEdge, passStamp);::  ${EAGER_DETACH} return linkEdge(producer, consumer, insertAfterEdge, passStamp);`,
  ],
  rotate: [
    `src/kernel/shape/graph/reuseEdge.ts::function moveIncomingEdgeToPosition(::${ROTATE} function moveIncomingEdgeToPosition(`,
    "src/kernel/shape/graph/reuseEdge.ts::    moveIncomingEdgeToPosition(consumer, edge, insertAfterEdge);::    rotateUnvisitedBlockBehindTail(consumer, edge, insertAfterEdge);",
  ],
};
