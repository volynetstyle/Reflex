// Analysis-only source mutations for the tracking ladder, applied by
// scripts/build-baseline-oracle.mjs --mutate to an archived copy of the
// sources; the checked-out sources are never changed.
//
//   hint-after  consult the producer's hint after the four-link outgoing
//               head start, as before 2026-10-25. Same answers and the same
//               slot fills, so only the order of existing probes changes.
//   no-detach   never detach the stale suffix eagerly
//               (reuseLocatedIncomingEdgeOrLink). Changes which edge survives
//               and therefore subscriber order, which the oracle pins: not a
//               candidate, it prices the policy.
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

export const variants = {
  "hint-after": [
    "src/kernel/shape/graph/findEdge.ts::  const hint = producer.tailIn;::  const hint = null;",
    "src/kernel/shape/graph/findEdge.ts::  const edge = findEdgeInLockstepPastHeadStart(::  const lateHint = producer.tailIn; if (lateHint !== null && lateHint.to === consumer && lateHint.from === producer) return lateHint; const edge = findEdgeInLockstepPastHeadStart(",
  ],
  "no-detach": [
    "src/kernel/shape/graph/reuseEdge.ts::hasIncomingRun(suffixStartEdge, EAGER_STALE_SUFFIX_CLEANUP_MIN) === true::false",
  ],
  rotate: [
    `src/kernel/shape/graph/reuseEdge.ts::function moveIncomingEdgeToPosition(::${ROTATE} function moveIncomingEdgeToPosition(`,
    "src/kernel/shape/graph/reuseEdge.ts::    moveIncomingEdgeToPosition(consumer, edge, insertAfterEdge);::    rotateUnvisitedBlockBehindTail(consumer, edge, insertAfterEdge);",
  ],
};
