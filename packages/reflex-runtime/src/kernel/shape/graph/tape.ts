/* eslint-disable no-var */
import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { Computing, Leased, Watcher } from "@runtime/kernel/shape/meta";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { trackingStamp } from "@runtime/kernel/state";

/**
 * The prepared tape: direct addressing of a consumer's incoming list,
 * entered when the pair lookup's locality stops paying (INV-P,
 * docs/INVARIANTS.md).
 *
 * The incoming list of a consumer C is an ordered tape of edges. Covering an
 * edge writes its producer's slot to its own cell, `P.tailIn = edge(P -> C)`
 * (an ordinary outgoing hint under INV-H), and sets the membership bit of
 * C's lane on P. The hint probe then answers C's covered pairs in one
 * comparison. Nothing is created, moved or unlinked, so a throw at any point
 * leaves the graph the lookup would have left.
 *
 * Arm. A lookup that leaves the locality tiers for the plain lockstep, or
 * whose finger race settles only in the far end of its window, is a strike
 * of its tracking pass, named by (consumer, pass stamp). The second strike
 * arms a lane for the pass, in O(1). Strike records live in a small table; a
 * record of a live pass is never evicted, so a nested pass never erases an
 * outer one's history. When every record belongs to a live pass, a new pass
 * does not adapt.
 *
 * Cover. Membership is materialized on demand, when the owner's lookup asks
 * for a certificate. The prefix (the edges this pass accepted) is covered up
 * to the cursor; it grows only at its end, so `coveredUpTo` is the frontier
 * of that proof and each edge is covered once. The suffix (edges of earlier
 * passes not read yet) is covered from `lastIn` towards the head, down to the
 * first edge with this pass's stamp (INV-T3), in chunks that double; after
 * UNCOVERED_MISSES requests answered by exact search, the rest of the suffix
 * is covered at once. A producer that cannot take the bit (Computing,
 * Watcher) stops coverage there; it is rechecked on the next request.
 *
 * Certify. While the active lane is live (its owner Computing, its frontier
 * carrying the lane's stamp) and covered, every producer of an attached
 * incoming edge of the owner carries the lane's bit, so a hint miss on an
 * idle producer without it proves absence. A bit without a cell sends the
 * lookup on to the exact search: a lost cell costs a lookup, never a twin.
 *
 * Lanes. Up to LANE_COUNT passes hold a lane at once, each with its own bit
 * (`Leased << lane`), so nested passes never share or clear each other's
 * bits. One lane is active: `preparedOwner` names its owner, and links to
 * it record their producer at once. A suspended owner is reactivated when
 * its own lookup next reaches the tape and covers its prefix from its
 * frontier. A pass that finds every lane live does not adapt.
 *
 * Revoke. A lane's bits are removed where they were set: over the prefix,
 * and over the covered run at the tail of the suffix. A lane whose owner has
 * started a new pass is revoked over its whole current list. A bit left on a
 * producer whose edge was dropped while its owner was suspended is stale: it
 * costs the lane's next owner one exact search, then is legitimate or
 * revoked with that owner's lane.
 */

const LANE_COUNT = 4;
const STRIKE_RECORDS = 5;
/** The first suffix chunk; each next one doubles. */
const SUFFIX_CHUNK = 32;
/** Certificate requests answered by exact search before the suffix is covered whole. */
const UNCOVERED_MISSES = 2;

interface Lane {
  owner: ReactiveNode | null;
  stamp: number;
  bit: number;
  /** Covered: the certificate's premise, saved while the lane is suspended. */
  complete: boolean;
  /** Last prefix edge known to carry the bit; null: none yet. */
  coveredUpTo: ReactiveEdge | null;
  /** Next suffix edge to cover, towards the head; null: start at `lastIn`. */
  suffixNext: ReactiveEdge | null;
  suffixCovered: boolean;
  /** A producer could not take the bit; rechecked on the next request. */
  blocked: boolean;
  misses: number;
  chunk: number;
}

const lanes: Lane[] = [];
for (let i = 0; i < LANE_COUNT; i++)
  lanes.push({
    owner: null,
    stamp: 0,
    bit: Leased << i,
    complete: false,
    coveredUpTo: null,
    suffixNext: null,
    suffixCovered: false,
    blocked: false,
    misses: 0,
    chunk: SUFFIX_CHUNK,
  });

const strikeConsumers: (ReactiveNode | null)[] = [];
const strikeStamps: number[] = [];
for (let i = 0; i < STRIKE_RECORDS; i++) {
  strikeConsumers.push(null);
  strikeStamps.push(0);
}

/**
 * The active lane's owner, read on every continuation entry of a lookup and
 * on every link, so a `var` (no hole check), as the registers in state.ts.
 */
export var preparedOwner: ReactiveNode | null = null;
var preparedPassStamp = 0;
var preparedLaneBit = Leased;
/** The active lane is covered: the certificate's premise. */
var hasFullTapeCoverage = false;
var activeLane: Lane | null = null;

/** Strike records and lanes that name a consumer: disposal's O(1) exit. */
var tapeRefs = 0;
/** Lanes with an owner. */
var lanesHeld = 0;
/** The most recent first strike, the usual partner of a second one. */
var lastRecord = 0;
/** Where the next first strike looks for a free or dead record. */
var nextRecord = 0;

/** Disposal of `consumer`: no strike record or lane may retain it. */
export function forgetStrikeConsumer(consumer: ReactiveNode): void {
  if (tapeRefs !== 0) forgetTapeReferences(consumer);
}

/**
 * Drops the consumer's records and lanes, and every dead one: a disposed
 * node is not live, so nothing it held is still needed. A dropped lane is
 * revoked over its owner's list, still attached here.
 */
function forgetTapeReferences(consumer: ReactiveNode): void {
  for (let i = 0; i < STRIKE_RECORDS; i++) {
    const recorded = strikeConsumers[i] as ReactiveNode | null;
    if (
      recorded !== null &&
      (recorded === consumer ||
        isPassLive(recorded, strikeStamps[i] as number) === false)
    ) {
      clearRecord(i);
    }
  }
  for (let i = 0; i < LANE_COUNT; i++) {
    const lane = lanes[i] as Lane;
    const owner = lane.owner;
    if (
      owner !== null &&
      (owner === consumer || isPassLive(owner, lane.stamp) === false)
    ) {
      const _revoked = revokeLane(lane, owner);
      /* @ev revoke(owner, _revoked) */
      freeLane(lane);
    }
  }
}

function setRecord(i: number, consumer: ReactiveNode, stamp: number): void {
  if (strikeConsumers[i] === null) tapeRefs++;
  strikeConsumers[i] = consumer;
  strikeStamps[i] = stamp;
}

function clearRecord(i: number): void {
  if (strikeConsumers[i] === null) return;
  strikeConsumers[i] = null;
  tapeRefs--;
}

/** Frees a lane whose bits are revoked or deliberately left stale. */
function freeLane(lane: Lane): void {
  if (lane.owner !== null) {
    lane.owner = null;
    lane.coveredUpTo = null;
    lane.suffixNext = null;
    tapeRefs--;
    lanesHeld--;
  }
  if (lane === activeLane) {
    activeLane = null;
    preparedOwner = null;
  }
}

/** The stamp the resolver gives the next read of a computing consumer. */
function getTrackingPassStamp(consumer: ReactiveNode): number {
  const cursorEdge = consumer.tailIn;
  return cursorEdge !== null ? cursorEdge.stamp : trackingStamp;
}

function isPassLive(owner: ReactiveNode, stamp: number): boolean {
  return (
    (owner.state & Computing) !== 0 && getTrackingPassStamp(owner) === stamp
  );
}

function isLeaseLive(owner: ReactiveNode): boolean {
  return (
    (owner.state & Computing) !== 0 &&
    getTrackingPassStamp(owner) === preparedPassStamp
  );
}

/**
 * Removes the lane's bits where they were set. While the owner's frontier
 * still carries the lane's stamp, that is the prefix up to it and the
 * covered run at the tail; otherwise (a new pass began) the whole list.
 * Returns the edges visited.
 */
function revokeLane(lane: Lane, owner: ReactiveNode): number {
  const bit = lane.bit;
  let visited = 0;
  const cursor = owner.tailIn;
  if (cursor === null || cursor.stamp !== lane.stamp) {
    for (
      let incomingEdge: ReactiveEdge | null = owner.firstIn;
      incomingEdge !== null;
      incomingEdge = incomingEdge.nextIn
    ) {
      incomingEdge.from.state &= ~bit;
      visited++;
    }
    return visited;
  }
  for (
    let incomingEdge: ReactiveEdge | null = owner.firstIn;
    incomingEdge !== null;
    incomingEdge = incomingEdge.nextIn
  ) {
    incomingEdge.from.state &= ~bit;
    visited++;
    if (incomingEdge === cursor) break;
  }
  for (
    let incomingEdge: ReactiveEdge | null = owner.lastIn;
    incomingEdge !== null &&
    incomingEdge.stamp !== lane.stamp &&
    (incomingEdge.from.state & bit) !== 0;
    incomingEdge = incomingEdge.prevIn
  ) {
    incomingEdge.from.state &= ~bit;
    visited++;
  }
  return visited;
}

/**
 * Ends the active lane of `owner`: revokes its bits. Whatever removes edges
 * from the active owner's list (cleanup, disposal) calls it first, so a
 * producer never leaves the list with its bit.
 */
export function releaseLease(owner: ReactiveNode): void {
  const lane = activeLane;
  if (lane === null) {
    preparedOwner = null;
    return;
  }
  const _revoked = revokeLane(lane, owner);
  /* @ev revoke(owner, _revoked) */
  freeLane(lane);
}

/**
 * Entry of a continuation of `producer -> consumer`'s lookup past the hint
 * and the head start, while `consumer` is the active owner: whether the
 * miss proves absence. False continues the exact search; its hint write
 * puts a found cell back, and on absence the link that follows puts the
 * producer on the tape (notePreparedLink).
 */
export function preparedMissIsAbsent(
  producer: ReactiveNode,
  consumer: ReactiveNode,
): boolean {
  if (isLeaseLive(consumer) === false) {
    releaseLease(consumer);
    return false;
  }
  if (hasFullTapeCoverage === false) return coverAndCertify(producer, consumer);

  // A self-edge, a frontier slot or a watcher's saved slot carries no cell.
  return (
    (producer.state & (Computing | Watcher | preparedLaneBit)) === 0 &&
    producer !== consumer
  );
}

/**
 * A certificate request on an uncovered lane: covers the prefix up to the
 * cursor and a chunk of the suffix, and certifies when both are complete.
 */
function coverAndCertify(
  producer: ReactiveNode,
  consumer: ReactiveNode,
): boolean {
  const lane = activeLane as Lane;
  let blocked = coverPrefix(lane, consumer);
  if (blocked === false && lane.suffixCovered === false) {
    lane.misses++;
    blocked = coverSuffix(
      lane,
      consumer,
      lane.misses > UNCOVERED_MISSES ? -1 : lane.chunk,
    );
    lane.chunk *= 2;
  }
  lane.blocked = blocked;
  if (blocked === true || lane.suffixCovered === false) {
    /* @ev uncovered-fallback(consumer, 0) */
    return false;
  }
  lane.complete = true;
  hasFullTapeCoverage = true;
  const r =
    (producer.state & (Computing | Watcher | lane.bit)) === 0 &&
    producer !== consumer;
  /* @ev certify-after-cover(consumer, r ? 1 : 0) */
  return r;
}

/**
 * Covers the prefix from its frontier up to the cursor. True when it stopped
 * at a producer that cannot take the bit.
 */
function coverPrefix(lane: Lane, consumer: ReactiveNode): boolean {
  const cursor = consumer.tailIn;
  let from = lane.coveredUpTo;
  if (cursor === null || from === cursor) return false;
  // A raw unlink may have detached the saved edge: then walk the prefix.
  if (
    from !== null &&
    (from.to !== consumer ||
      (from.prevIn === null && consumer.firstIn !== from))
  ) {
    from = null;
  }
  const bit = lane.bit;
  let blocked = false;
  let _covered = 0;
  for (
    let incomingEdge = from === null ? consumer.firstIn : from.nextIn;
    incomingEdge !== null;
    incomingEdge = incomingEdge.nextIn
  ) {
    const producer = incomingEdge.from;
    const producerState = producer.state;
    // INV-H: a Computing node's slot is a frontier, a watcher's is saved
    // and restored by validation. Coverage stops at it.
    if ((producerState & (Computing | Watcher)) !== 0) {
      blocked = true;
      break;
    }
    producer.state = producerState | bit;
    producer.tailIn = incomingEdge;
    lane.coveredUpTo = incomingEdge;
    _covered++;
    if (incomingEdge === cursor) break;
  }
  /* @ev cover(consumer, _covered) */
  return blocked;
}

/**
 * Covers up to `budget` suffix edges (all for a negative budget), from the
 * saved boundary towards the head, down to the first edge of this pass. True
 * when it stopped at a producer that cannot take the bit.
 */
function coverSuffix(
  lane: Lane,
  consumer: ReactiveNode,
  budget: number,
): boolean {
  const stamp = lane.stamp;
  const bit = lane.bit;
  let incomingEdge = lane.suffixNext;
  // The saved boundary may have been read into the prefix or detached:
  // restart from the tail, passing over the edges already covered.
  if (
    incomingEdge === null ||
    incomingEdge.to !== consumer ||
    incomingEdge.stamp === stamp ||
    (incomingEdge.prevIn === null &&
      incomingEdge.nextIn === null &&
      consumer.firstIn !== incomingEdge)
  ) {
    incomingEdge = consumer.lastIn;
  }
  let blocked = false;
  let covered = 0;
  while (incomingEdge !== null && incomingEdge.stamp !== stamp) {
    const producer = incomingEdge.from;
    const producerState = producer.state;
    if ((producerState & bit) === 0) {
      if ((producerState & (Computing | Watcher)) !== 0) {
        blocked = true;
        break;
      }
      producer.state = producerState | bit;
      producer.tailIn = incomingEdge;
      covered++;
    }
    incomingEdge = incomingEdge.prevIn;
    if (budget >= 0 && covered >= budget) break;
  }
  lane.suffixNext = incomingEdge;
  if (
    blocked === false &&
    (incomingEdge === null || incomingEdge.stamp === stamp)
  ) {
    lane.suffixCovered = true;
  }
  /* @ev cover(consumer, covered) */
  return blocked;
}

/**
 * Entry of the plain lockstep for a computing consumer: the active owner's
 * certificate, otherwise the consumer's own suspended lane or a strike.
 * Returns the answer when the tape settles the lookup (a cell, or certified
 * absence), undefined to run the lockstep.
 */
export function settleOnPreparedTape(
  producer: ReactiveNode,
  consumer: ReactiveNode,
): ReactiveEdge | null | undefined {
  if (preparedOwner === consumer) {
    return preparedMissIsAbsent(producer, consumer) === true ? null : undefined;
  }

  if (acquireTape(consumer, true) === false) return undefined;

  const slotEdge = producer.tailIn;
  if (
    slotEdge !== null &&
    slotEdge.to === consumer &&
    slotEdge.from === producer
  ) {
    /* @ev cell-hit(consumer, 0) */
    return slotEdge;
  }
  return preparedMissIsAbsent(producer, consumer) === true ? null : undefined;
}

/**
 * A finger-race hit past the near end of the window: found, but at a cost
 * the tape would not have paid. A strike of `consumer`'s pass; the answer
 * stands.
 */
export function strikeOnFarFingerHit(
  edge: ReactiveEdge,
  consumer: ReactiveNode,
): ReactiveEdge {
  if ((consumer.state & Computing) !== 0) void acquireTape(consumer, false);
  return edge;
}

/**
 * Makes `consumer`'s pass the active owner if it holds a suspended lane and
 * `wantsCertificate` (a finger hit needs none: the lane stays suspended, as
 * an active one would stay untouched), or if it strikes for the second time
 * and a lane is free. True when it became the active owner.
 */
function acquireTape(
  consumer: ReactiveNode,
  wantsCertificate: boolean,
): boolean {
  const passStamp = getTrackingPassStamp(consumer);
  if (preparedOwner === consumer && preparedPassStamp === passStamp)
    return false;

  if (lanesHeld !== 0) {
    for (let i = 0; i < LANE_COUNT; i++) {
      const lane = lanes[i] as Lane;
      if (lane.owner === consumer && lane.stamp === passStamp) {
        if (wantsCertificate === false) return false;
        resumeLane(lane, consumer);
        /* @ev resume(consumer, passStamp) */
        return true;
      }
    }
  }
  /* @ev strike(consumer, passStamp) */

  // The second strike of this pass: its record is usually the latest one.
  let found = -1;
  if (
    strikeConsumers[lastRecord] === consumer &&
    strikeStamps[lastRecord] === passStamp
  ) {
    found = lastRecord;
  } else {
    for (let i = 0; i < STRIKE_RECORDS; i++) {
      if (strikeConsumers[i] === consumer && strikeStamps[i] === passStamp) {
        found = i;
        break;
      }
    }
  }
  if (found >= 0) {
    // Later strikes retry while every lane is live.
    if (armLane(consumer, passStamp) === false) {
      /* @ev lease-denied(consumer, passStamp) */
      return false;
    }
    clearRecord(found);
    return true;
  }

  // The first strike: a free record, or one of a pass that ended. A live
  // pass's record is never evicted; with none free, this pass does not adapt.
  for (let k = 0; k < STRIKE_RECORDS; k++) {
    const i = (nextRecord + k) % STRIKE_RECORDS;
    const recorded = strikeConsumers[i] as ReactiveNode | null;
    if (
      recorded === null ||
      isPassLive(recorded, strikeStamps[i] as number) === false
    ) {
      setRecord(i, consumer, passStamp);
      lastRecord = i;
      nextRecord = (i + 1) % STRIKE_RECORDS;
      return false;
    }
  }
  /* @ev strike-table-full(consumer, passStamp) */
  return false;
}

/** Leaves the active lane suspended, remembering how far it is covered. */
function suspendActiveLane(): void {
  const lane = activeLane;
  if (lane === null) return;
  lane.complete = hasFullTapeCoverage;
  // A covered lane carries the bit on every edge up to its owner's frontier
  // (links while active were recorded at once).
  if (hasFullTapeCoverage)
    lane.coveredUpTo = (lane.owner as ReactiveNode).tailIn;
  activeLane = null;
  preparedOwner = null;
}

function activateLane(lane: Lane): void {
  activeLane = lane;
  preparedOwner = lane.owner;
  preparedPassStamp = lane.stamp;
  preparedLaneBit = lane.bit;
  hasFullTapeCoverage = lane.complete;
}

/** Arms a free lane, or one whose owner's pass ended, for this pass: O(1). */
function armLane(consumer: ReactiveNode, passStamp: number): boolean {
  let lane: Lane | null = null;
  for (let i = 0; i < LANE_COUNT; i++) {
    const candidate = lanes[i] as Lane;
    if (candidate.owner === null) {
      lane = candidate;
      break;
    }
  }
  if (lane === null) {
    for (let i = 0; i < LANE_COUNT; i++) {
      const candidate = lanes[i] as Lane;
      if (
        isPassLive(candidate.owner as ReactiveNode, candidate.stamp) === false
      ) {
        lane = candidate;
        break;
      }
    }
  }
  if (lane === null) return false;

  const previous = lane.owner;
  if (previous !== null) {
    const _reclaimed = revokeLane(lane, previous);
    /* @ev reclaim(consumer, _reclaimed) */
  }
  freeLane(lane);
  suspendActiveLane();

  lane.owner = consumer;
  lane.stamp = passStamp;
  lane.complete = false;
  lane.coveredUpTo = null;
  lane.suffixNext = null;
  lane.suffixCovered = false;
  lane.blocked = false;
  lane.misses = 0;
  lane.chunk = SUFFIX_CHUNK;
  tapeRefs++;
  lanesHeld++;
  activateLane(lane);
  /* @ev arm(consumer, passStamp) */
  return true;
}

/**
 * Reactivates a suspended lane of `consumer`'s live pass: covers the edges
 * it accepted since its frontier, then certifies as before if it was covered.
 */
function resumeLane(lane: Lane, consumer: ReactiveNode): void {
  suspendActiveLane();
  lane.blocked = coverPrefix(lane, consumer);
  if (lane.blocked) lane.complete = false;
  activateLane(lane);
}

/**
 * An edge was linked to the active owner: its producer joins the tape, or,
 * when its slot cannot hold a cell, the certificate is withdrawn until the
 * next request rechecks it.
 */
export function notePreparedLink(edge: ReactiveEdge): void {
  const producer = edge.from;
  const producerState = producer.state;
  if ((producerState & (Computing | Watcher)) === 0) {
    producer.state = producerState | preparedLaneBit;
    producer.tailIn = edge;
  } else {
    /* @ev coverage-drop(edge.to, 0) */
    hasFullTapeCoverage = false;
  }
}
