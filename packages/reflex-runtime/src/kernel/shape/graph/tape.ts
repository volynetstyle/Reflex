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
 * (an ordinary outgoing hint under INV-H), and sets the membership tag of
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
 * is covered at once. A producer that cannot take the tag (Computing,
 * Watcher) stops coverage there; it is rechecked on the next request.
 *
 * Certify. While the active lane is live (its owner Computing, its frontier
 * carrying the lane's stamp) and covered, every producer of an attached
 * incoming edge of the owner carries the lane's current tag, so a hint miss on an
 * idle producer without it proves absence. A tag without a cell sends the
 * lookup on to the exact search: a lost cell costs a lookup, never a twin.
 *
 * Lanes. Up to LANE_COUNT passes hold a lane at once, each with its own
 * three-bit field of `state` (from `Leased` up), so nested passes never share
 * or clear each other's membership. One lane is active: `preparedOwner`
 * names its owner, and links to it record their producer at once. A
 * suspended owner is reactivated when its own lookup next reaches the tape
 * and covers its prefix from its frontier. A pass that finds every lane
 * live does not adapt.
 *
 * Generations. A producer is a member of a lane when its field holds the
 * lane's current generation (1 to 7; 0 is never current). Arming a lane
 * moves its generation, so every tag of earlier owners stops being current
 * at once: nothing is revoked, by release, cleanup, disposal or reuse. A
 * tag left from seven generations back aliases the current one, and lanes
 * are armed round robin, so that is 28 arms that did not refresh it: a false
 * "maybe", answered by one exact search; the link that follows reveals
 * the alias (the producer had the tag and no edge), and the lane moves to
 * its next generation and covers again, so the rest of the aliased set
 * costs a recover, not a search each.
 */

const LANE_COUNT = 4;
/** Bits of `state` per lane, from `Leased` up. */
const LANE_BITS = 3;
/** Generations of a lane: 1 to 7; 0 is never current. */
const GENERATIONS = 7;
const STRIKE_RECORDS = 5;
/** The first suffix chunk; each next one doubles. */
const SUFFIX_CHUNK = 32;
/** Certificate requests answered by exact search before the suffix is covered whole. */
const UNCOVERED_MISSES = 2;

interface Lane {
  owner: ReactiveNode | null;
  stamp: number;
  /** The lane's LANE_BITS bits of `state`. */
  mask: number;
  /** The current generation in place: 1 to GENERATIONS times the field's unit. */
  tag: number;
  /** Covered: the certificate's premise, saved while the lane is suspended. */
  complete: boolean;
  /** Last prefix edge known to carry the tag; null: none yet. */
  coveredUpTo: ReactiveEdge | null;
  /** Next suffix edge to cover, towards the head; null: start at `lastIn`. */
  suffixNext: ReactiveEdge | null;
  suffixCovered: boolean;
  /** A producer could not take the tag; rechecked on the next request. */
  blocked: boolean;
  misses: number;
  chunk: number;
  /** Generations this pass moved past after finding an aliased tag. */
  regenerations: number;
}

const lanes: Lane[] = [];
for (let i = 0; i < LANE_COUNT; i++)
  lanes.push({
    owner: null,
    stamp: 0,
    mask: (Leased * GENERATIONS) << (LANE_BITS * i),
    tag: 0,
    complete: false,
    coveredUpTo: null,
    suffixNext: null,
    suffixCovered: false,
    blocked: false,
    misses: 0,
    regenerations: 0,
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
var preparedLaneMask = Leased * GENERATIONS;
var preparedLaneTag = Leased;
/** The active lane is covered: the certificate's premise. */
var hasFullTapeCoverage = false;
var activeLane: Lane | null = null;

/** Strike records and lanes that name a consumer: disposal's O(1) exit. */
var tapeRefs = 0;
/** Lanes with an owner. */
var lanesHeld = 0;
/** The most recent first strike, the usual partner of a second one. */
var lastRecord = 0;
/** Where the next arm looks for a free or dead lane. */
var nextLane = 0;
/** Where the next first strike looks for a free or dead record. */
var nextRecord = 0;

/** Layout control: module slots only, so hot slots move as in 9971d9f. */
var layoutPad0 = 0;
var layoutPad1 = 1;
var layoutPad2 = 2;
var layoutPad3 = 3;
var layoutPad4 = 4;
var layoutPad5 = 5;
var layoutPad6 = 6;
var layoutPad7 = 7;
var layoutPad8 = 8;
var layoutPad9 = 9;
var layoutPad10 = 10;
/** Disposal of `consumer`: no strike record or lane may retain it. */
export function forgetStrikeConsumer(consumer: ReactiveNode): void {
  if (tapeRefs !== 0) forgetTapeReferences(consumer);
}

/**
 * Drops the consumer's records and lanes, and every dead one: a disposed
 * node is not live, so nothing it held is still needed. A dropped lane's
 * tags stop being current when the lane is armed again.
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

/** Frees a lane; its tags stop being current when it is armed again. */
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
 * Ends the active lane of `owner`, in O(1): its tags stop being current when
 * the lane is armed again. Cleanup and disposal call it before they remove
 * edges from the active owner's list.
 */
export function releaseLease(_owner: ReactiveNode): void {
  if (tapeRefs < 0) tapeRefs = layoutPad0+layoutPad1+layoutPad2+layoutPad3+layoutPad4+layoutPad5+layoutPad6+layoutPad7+layoutPad8+layoutPad9+layoutPad10;
  /* @ev retire(_owner, 0) */
  const lane = activeLane;
  if (lane === null) preparedOwner = null;
  else freeLane(lane);
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
  const state = producer.state;
  return (
    (state & (Computing | Watcher)) === 0 &&
    (state & preparedLaneMask) !== preparedLaneTag &&
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
  const state = producer.state;
  const r =
    (state & (Computing | Watcher)) === 0 &&
    (state & lane.mask) !== lane.tag &&
    producer !== consumer;
  /* @ev certify-after-cover(consumer, r ? 1 : 0) */
  return r;
}

/**
 * Covers the prefix from its frontier up to the cursor. True when it stopped
 * at a producer that cannot take the tag.
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
  const mask = lane.mask;
  const tag = lane.tag;
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
    producer.state = (producerState & ~mask) | tag;
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
 * when it stopped at a producer that cannot take the tag.
 */
function coverSuffix(
  lane: Lane,
  consumer: ReactiveNode,
  budget: number,
): boolean {
  const stamp = lane.stamp;
  const mask = lane.mask;
  const tag = lane.tag;
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
  // The budget counts edges visited: a tag that is already current (covered
  // before a restart, or an aliased generation) still costs its step, and
  // still gets its cell, so the hint answers it.
  while (incomingEdge !== null && incomingEdge.stamp !== stamp) {
    const producer = incomingEdge.from;
    const producerState = producer.state;
    if ((producerState & (Computing | Watcher)) === 0) {
      producer.state = (producerState & ~mask) | tag;
      producer.tailIn = incomingEdge;
    } else if ((producerState & mask) !== tag) {
      blocked = true;
      break;
    }
    covered++;
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
  // A covered lane carries its tag on every edge up to its owner's frontier
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
  preparedLaneMask = lane.mask;
  preparedLaneTag = lane.tag;
  hasFullTapeCoverage = lane.complete;
}

/**
 * Arms a free lane, or one whose owner's pass ended, for this pass, in O(1):
 * a new generation, nothing to clear.
 */
function armLane(consumer: ReactiveNode, passStamp: number): boolean {
  // Round robin over free lanes and lanes whose owner's pass ended, so
  // every lane's generation moves once per LANE_COUNT arms: a tag aliases
  // only after GENERATIONS * LANE_COUNT arms that did not refresh it.
  let lane: Lane | null = null;
  for (let k = 0; k < LANE_COUNT; k++) {
    const i = (nextLane + k) % LANE_COUNT;
    const candidate = lanes[i] as Lane;
    const owner = candidate.owner;
    if (owner === null || isPassLive(owner, candidate.stamp) === false) {
      lane = candidate;
      nextLane = (i + 1) % LANE_COUNT;
      break;
    }
  }
  if (lane === null) return false;

  freeLane(lane);
  suspendActiveLane();

  nextGeneration(lane);

  lane.owner = consumer;
  lane.stamp = passStamp;
  lane.complete = false;
  lane.coveredUpTo = null;
  lane.suffixNext = null;
  lane.suffixCovered = false;
  lane.blocked = false;
  lane.misses = 0;
  lane.regenerations = 0;
  lane.chunk = SUFFIX_CHUNK;
  tapeRefs++;
  lanesHeld++;
  activateLane(lane);
  /* @ev arm(consumer, passStamp) */
  return true;
}

/** A new generation: every earlier owner's tag stops being current. */
function nextGeneration(lane: Lane): void {
  const unit = lane.mask / GENERATIONS;
  const generation = lane.tag / unit;
  lane.tag = (generation === GENERATIONS ? 1 : generation + 1) * unit;
}

/**
 * The active owner links a producer whose tag is already current: it had
 * no edge to the owner, so the tag was left by an owner GENERATIONS
 * generations back (an alias). Every other such producer would cost an
 * exact search; moving to the next generation costs a recover instead.
 * Bounded per pass, so a run of aliases cannot cycle.
 */
function regenerateActiveLane(): void {
  const lane = activeLane as Lane;
  if (lane.regenerations === GENERATIONS - 1) return;
  lane.regenerations++;
  /* @ev regenerate(lane.owner as ReactiveNode, lane.regenerations) */
  nextGeneration(lane);
  lane.complete = false;
  lane.coveredUpTo = null;
  lane.suffixNext = null;
  lane.suffixCovered = false;
  activateLane(lane);
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
 * next request rechecks it. A producer that already carried the current
 * tag had no edge: an aliased generation, replaced by the next one.
 */
export function notePreparedLink(edge: ReactiveEdge): void {
  const producer = edge.from;
  const producerState = producer.state;
  if ((producerState & (Computing | Watcher)) === 0) {
    if ((producerState & preparedLaneMask) === preparedLaneTag)
      regenerateActiveLane();
    producer.state = (producerState & ~preparedLaneMask) | preparedLaneTag;
    producer.tailIn = edge;
  } else {
    /* @ev coverage-drop(edge.to, 0) */
    hasFullTapeCoverage = false;
  }
}
