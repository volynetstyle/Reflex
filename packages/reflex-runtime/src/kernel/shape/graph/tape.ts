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
 * Hot boundary. The lookup inlines settleOnPreparedTape,
 * preparedMissIsAbsent, the two strike entries and notePreparedLink. They
 * keep the bytecode of the single-lease tape they replace, except where a
 * lane needs a value the old tape had as a constant (the published tag), or
 * a call where the old tape stored the strike register; everything else
 * runs behind the calls the old tape already made (releaseLease,
 * prepareTape), so the lookup's optimized code does not depend on how the
 * lanes are kept.
 *
 * Arm. A lookup that leaves the locality tiers for the plain lockstep, or
 * whose finger race settles only in the far end of its window, is a strike
 * of its tracking pass, named by (consumer, pass stamp). The second strike
 * arms a lane for the pass, in O(1). Strike records live in a small table; a
 * record of a live pass is never evicted, so a nested pass never erases an
 * outer one's history. When every record belongs to a live pass, a new pass
 * does not adapt. The register (`lastStrikeConsumer`) caches the latest
 * record, so a pass's second strike takes the inlined path when nothing
 * else needs deciding.
 *
 * Cover. Membership is materialized on demand, on the pass's strikes. The
 * prefix (the edges this pass accepted) is covered up to the cursor; it
 * grows only at its end, so `coveredUpTo` is the frontier of that proof and
 * each edge is covered once. The suffix (edges of earlier passes not read
 * yet) is covered from `lastIn` towards the head, down to the first edge
 * with this pass's stamp (INV-T3), in chunks that double; after
 * UNCOVERED_MISSES cover steps, the rest of the suffix is covered at once. A
 * producer that cannot take the tag (Computing, Watcher) stops coverage
 * there; it is rechecked on the next step.
 *
 * Publish. A lane is published (`preparedOwner`) only while it is covered:
 * every producer of an attached incoming edge of the owner then carries the
 * lane's current tag, so a hint miss on an idle producer without it proves
 * absence, and links to the owner tag their producer at once. An uncovered
 * lane is dormant: its owner's requests reach it through the strike path,
 * which covers and publishes; a link of a producer that cannot take the tag
 * unpublishes it until the next step rechecks. A tag without a cell sends
 * the lookup on to the exact search: a lost cell costs a lookup, never a
 * twin.
 *
 * Lanes. Up to LANE_COUNT passes hold a lane at once, each with its own
 * field of `state` (from `Leased` up), so nested passes never share or
 * clear each other's membership. One lane is active (published or dormant);
 * a suspended owner is reactivated when its own lookup next strikes, and
 * covers its prefix from its frontier. A pass that finds every lane live
 * does not adapt.
 *
 * Generations. A lane's field holds one bit per generation; a producer is a
 * member when its field holds the lane's current one. Arming a lane moves
 * its generation, so every tag of earlier owners stops being current at
 * once: nothing is revoked, by release, cleanup, disposal or reuse. A tag
 * left from GENERATIONS generations back aliases the current one, and lanes
 * are armed round robin, so that is GENERATIONS * LANE_COUNT arms that did
 * not refresh it: a false "maybe", answered by one exact search; the link
 * that follows reveals the alias (the producer had the tag and no edge), and
 * the lane moves to its next generation and covers again, so the rest of
 * the aliased set costs a recover, not a search each.
 */

const LANE_COUNT = 4;
/** Generations of a lane, one bit of `state` each, from `Leased` up. */
const GENERATIONS = 5;
const STRIKE_RECORDS = 5;
/** The first suffix chunk; each next one doubles. */
const SUFFIX_CHUNK = 32;
/** Cover steps before the suffix is covered whole. */
const UNCOVERED_MISSES = 2;

interface Lane {
  owner: ReactiveNode | null;
  stamp: number;
  /** The lane's GENERATIONS bits of `state`. */
  mask: number;
  /** The current generation's bit; 0 before the first arm. */
  tag: number;
  /** Covered: the premise of publishing, saved while the lane is suspended. */
  complete: boolean;
  /** Last prefix edge known to carry the tag; null: none yet. */
  coveredUpTo: ReactiveEdge | null;
  /** Next suffix edge to cover, towards the head; null: start at `lastIn`. */
  suffixNext: ReactiveEdge | null;
  suffixCovered: boolean;
  /** A producer could not take the tag; rechecked on the next step. */
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
    mask: (((1 << GENERATIONS) - 1) * Leased) << (GENERATIONS * i),
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
 * The published lane's owner, read on every continuation entry of a lookup
 * and on every link, so a `var` (no hole check), as the registers in
 * state.ts.
 */
export var preparedOwner: ReactiveNode | null = null;
var preparedPassStamp = 0;
/** False unless the pass of the lane last activated is published. */
var hasFullTapeCoverage = false;
/** Computing | Watcher | the published tag: one test for "no cell, no member". */
var preparedAbsenceMask = Computing | Watcher | Leased;
/** Every bit of `state` outside the published lane's field. */
var preparedLaneKeep = ~0;
var preparedLaneTag = Leased;

/** The latest strike record, mirrored for the inlined second strike. */
var lastStrikeConsumer: ReactiveNode | null = null;
var lastStrikePassStamp = 0;

/** The lane of the pass last activated: published, or dormant. */
var activeLane: Lane | null = null;
/** The register, strike records and lanes that name a consumer. */
var tapeRefs = 0;
/** Lanes with an owner. */
var lanesHeld = 0;
/** Where the next arm looks for a free or dead lane. */
var nextLane = 0;
/** Where the next first strike looks for a free or dead record. */
var nextRecord = 0;

/** Disposal of `consumer`: no strike record or lane may retain it. */
export function forgetStrikeConsumer(consumer: ReactiveNode): void {
  if (tapeRefs !== 0) forgetTapeReferences(consumer);
}

/**
 * Drops the consumer's register, records and lanes, and every dead record
 * and lane: a disposed node is not live, so nothing it held is still needed.
 * A dropped lane's tags stop being current when the lane is armed again.
 */
function forgetTapeReferences(consumer: ReactiveNode): void {
  if (lastStrikeConsumer === consumer) setRegister(null, 0);
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

function setRegister(consumer: ReactiveNode | null, stamp: number): void {
  if (lastStrikeConsumer === null) {
    if (consumer !== null) tapeRefs++;
  } else if (consumer === null) {
    tapeRefs--;
  }
  lastStrikeConsumer = consumer;
  lastStrikePassStamp = stamp;
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
    hasFullTapeCoverage = false;
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
 * Ends the lane of `owner` if it is the active one, in O(1): its tags stop
 * being current when the lane is armed again. Cleanup and disposal call it
 * before they remove edges from the published owner's list; a lookup calls
 * it when the owner's pass ended.
 */
export function releaseLease(owner: ReactiveNode): void {
  /* @ev retire(owner, 0) */
  const lane = activeLane;
  if (lane !== null && lane.owner === owner) freeLane(lane);
  else if (preparedOwner === owner) {
    preparedOwner = null;
    hasFullTapeCoverage = false;
  }
}

/**
 * Entry of a continuation of `producer -> consumer`'s lookup past the hint
 * and the head start, while `consumer` is the published owner or has just
 * been activated by its strike: whether the miss proves absence. False
 * continues the exact search; its hint write puts a found cell back, and on
 * absence the link that follows puts the producer on the tape
 * (notePreparedLink).
 */
export function preparedMissIsAbsent(
  producer: ReactiveNode,
  consumer: ReactiveNode,
): boolean {
  if (isLeaseLive(consumer) === false) {
    releaseLease(consumer);
    return false;
  }

  // A self-edge, a frontier slot or a watcher's saved slot carries no cell.
  return (
    hasFullTapeCoverage &&
    (producer.state & preparedAbsenceMask) === 0 &&
    producer !== consumer
  );
}

/**
 * Entry of the plain lockstep for a computing consumer: the published
 * owner's certificate, otherwise a strike. Returns the answer when the tape
 * settles the lookup (a cell, or certified absence), undefined to run the
 * lockstep.
 */
export function settleOnPreparedTape(
  producer: ReactiveNode,
  consumer: ReactiveNode,
): ReactiveEdge | null | undefined {
  if (preparedOwner === consumer) {
    return preparedMissIsAbsent(producer, consumer) === true ? null : undefined;
  }

  if (recordStrikeAndMaybePrepareTape(consumer) === false) return undefined;

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
  if ((consumer.state & Computing) !== 0) void recordFingerStrike(consumer);
  return edge;
}

/**
 * A strike that wants a certificate. The register's pass strikes again on
 * the inlined path; any other strike is decided aside (strikeAside). True
 * when the consumer's lane is active: published, or dormant with no
 * certificate.
 */
function recordStrikeAndMaybePrepareTape(consumer: ReactiveNode): boolean {
  const passStamp = getTrackingPassStamp(consumer);

  if (lastStrikeConsumer !== consumer || lastStrikePassStamp !== passStamp) {
    return strikeAside(consumer, passStamp, true);
  }

  // The register names a pass only while no live published lane of another
  // pass could refuse it here (strikeAside), so the refusal below is the
  // single-lease tape's, kept for its shape.
  const currentOwner = preparedOwner;
  if (currentOwner !== null) {
    if (currentOwner === consumer && preparedPassStamp === passStamp)
      return false;
    if (isLeaseLive(currentOwner) === true) return false;
    releaseLease(currentOwner);
  }

  prepareTape(consumer, passStamp);
  return true;
}

/**
 * recordStrikeAndMaybePrepareTape for a finger hit, which needs no
 * certificate: a suspended lane stays suspended, as a published one stays
 * untouched. Its result is not read.
 */
function recordFingerStrike(consumer: ReactiveNode): boolean {
  const passStamp = getTrackingPassStamp(consumer);

  if (lastStrikeConsumer !== consumer || lastStrikePassStamp !== passStamp) {
    return strikeAside(consumer, passStamp, false);
  }

  const currentOwner = preparedOwner;
  if (currentOwner !== null) {
    if (currentOwner === consumer && preparedPassStamp === passStamp)
      return false;
    if (isLeaseLive(currentOwner) === true) return false;
    releaseLease(currentOwner);
  }

  prepareTapeOnFingerHit(consumer, passStamp);
  return true;
}

/**
 * A strike the register does not settle: the pass's own lane (resumed when
 * it wants a certificate, or when it is the dormant active one), its second
 * strike (arms), or its first (recorded). True when its lane is active.
 */
function strikeAside(
  consumer: ReactiveNode,
  passStamp: number,
  wantsCertificate: boolean,
): boolean {
  const lane = laneOf(consumer, passStamp);
  if (lane !== null) {
    if (lane === activeLane && preparedOwner === consumer) {
      setRegister(consumer, passStamp);
      return false;
    }
    if (lane !== activeLane && wantsCertificate === false) return false;
    resumeLane(lane, consumer);
    setRegister(consumer, passStamp);
    /* @ev resume(consumer, passStamp) */
    return true;
  }
  /* @ev strike(consumer, passStamp) */

  const found = findRecord(consumer, passStamp);
  if (found >= 0) {
    // Later strikes retry while every lane is live.
    if (armLane(consumer, passStamp, wantsCertificate) === false) {
      /* @ev lease-denied(consumer, passStamp) */
      return false;
    }
    clearRecord(found);
    setRegister(consumer, passStamp);
    return true;
  }

  recordFirstStrike(consumer, passStamp);
  return false;
}

/**
 * The inlined second strike of the register's pass, or a dormant owner's
 * request: its lane resumes and covers, or a lane is armed and covered.
 * Leaves no certificate for a consumer it did not publish.
 */
function prepareTape(consumer: ReactiveNode, passStamp: number): void {
  const lane = laneOf(consumer, passStamp);
  if (lane !== null) {
    resumeLane(lane, consumer);
    /* @ev resume(consumer, passStamp) */
  } else {
    /* @ev strike(consumer, passStamp) */
    const found = findRecord(consumer, passStamp);
    if (found < 0) recordFirstStrike(consumer, passStamp);
    else if (armLane(consumer, passStamp, true) === true) clearRecord(found);
    else {
      /* @ev lease-denied(consumer, passStamp) */
    }
  }
  if (preparedOwner !== consumer) hasFullTapeCoverage = false;
}

/** prepareTape for a finger hit: arms without covering, resumes no lane. */
function prepareTapeOnFingerHit(
  consumer: ReactiveNode,
  passStamp: number,
): void {
  const lane = laneOf(consumer, passStamp);
  if (lane !== null) {
    // The dormant active lane takes the step its next request would.
    if (lane === activeLane) resumeLane(lane, consumer);
    return;
  }
  /* @ev strike(consumer, passStamp) */
  const found = findRecord(consumer, passStamp);
  if (found < 0) recordFirstStrike(consumer, passStamp);
  else if (armLane(consumer, passStamp, false) === true) clearRecord(found);
}

/**
 * The first strike: a free record, or one of a pass that ended. A live
 * pass's record is never evicted; with none free, this pass does not adapt.
 * The register takes it unless a live published lane of another pass would
 * refuse its second strike on the inlined path: that one comes back aside.
 */
function recordFirstStrike(consumer: ReactiveNode, passStamp: number): void {
  for (let k = 0; k < STRIKE_RECORDS; k++) {
    const i = (nextRecord + k) % STRIKE_RECORDS;
    const recorded = strikeConsumers[i] as ReactiveNode | null;
    if (
      recorded === null ||
      isPassLive(recorded, strikeStamps[i] as number) === false
    ) {
      setRecord(i, consumer, passStamp);
      nextRecord = (i + 1) % STRIKE_RECORDS;
      const owner = preparedOwner;
      if (owner === null || isLeaseLive(owner) === false)
        setRegister(consumer, passStamp);
      else setRegister(null, 0);
      return;
    }
  }
  /* @ev strike-table-full(consumer, passStamp) */
}

/** Whether `consumer`'s current pass holds a lane, published or not (tests). */
export function holdsTapeLane(consumer: ReactiveNode): boolean {
  return laneOf(consumer, getTrackingPassStamp(consumer)) !== null;
}

function laneOf(consumer: ReactiveNode, passStamp: number): Lane | null {
  if (lanesHeld === 0) return null;
  for (let i = 0; i < LANE_COUNT; i++) {
    const lane = lanes[i] as Lane;
    if (lane.owner === consumer && lane.stamp === passStamp) return lane;
  }
  return null;
}

function findRecord(consumer: ReactiveNode, passStamp: number): number {
  for (let i = 0; i < STRIKE_RECORDS; i++) {
    if (strikeConsumers[i] === consumer && strikeStamps[i] === passStamp)
      return i;
  }
  return -1;
}

/**
 * One cover step, as one certificate request: a covered lane covers what
 * its owner accepted since its frontier; an uncovered one covers its prefix
 * up to the cursor and a chunk of its suffix.
 */
function coverStep(lane: Lane, consumer: ReactiveNode): void {
  if (lane.complete === true) {
    lane.blocked = coverPrefix(lane, consumer);
    if (lane.blocked === true) lane.complete = false;
    return;
  }
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
  if (blocked === false && lane.suffixCovered === true) lane.complete = true;
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
  const keep = ~lane.mask;
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
    producer.state = (producerState & keep) | tag;
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
  const keep = ~lane.mask;
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
      producer.state = (producerState & keep) | tag;
      producer.tailIn = incomingEdge;
    } else if ((producerState & tag) === 0) {
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
 * Saves the active lane's state: covered while it is published (links to a
 * published owner were tagged at once, so it is covered up to the cursor);
 * a dormant lane, or one a link unpublished, is not.
 */
function syncActiveLane(lane: Lane): void {
  const owner = lane.owner as ReactiveNode;
  lane.complete = preparedOwner === owner && hasFullTapeCoverage === true;
  if (lane.complete === true) lane.coveredUpTo = owner.tailIn;
}

/** Leaves the active lane suspended, remembering how far it is covered. */
function suspendActiveLane(): void {
  const lane = activeLane;
  if (lane === null) return;
  syncActiveLane(lane);
  activeLane = null;
  preparedOwner = null;
  hasFullTapeCoverage = false;
}

/** Makes `lane` active: published when it is covered, dormant otherwise. */
function activateLane(lane: Lane): void {
  activeLane = lane;
  preparedPassStamp = lane.stamp;
  preparedAbsenceMask = Computing | Watcher | lane.tag;
  preparedLaneKeep = ~lane.mask;
  preparedLaneTag = lane.tag;
  if (lane.complete === true) {
    preparedOwner = lane.owner;
    hasFullTapeCoverage = true;
  } else {
    preparedOwner = null;
    hasFullTapeCoverage = false;
  }
}

/**
 * Arms a free lane, or one whose owner's pass ended, for this pass, in O(1):
 * a new generation, nothing to clear. A strike that wants a certificate
 * takes its first cover step at once.
 */
function armLane(
  consumer: ReactiveNode,
  passStamp: number,
  cover: boolean,
): boolean {
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
  /* @ev arm(consumer, passStamp) */
  if (cover === true) coverStep(lane, consumer);
  activateLane(lane);
  return true;
}

/** A new generation: every earlier owner's tag stops being current. */
function nextGeneration(lane: Lane): void {
  const first = lane.mask & -lane.mask;
  const next = lane.tag * 2;
  lane.tag = lane.tag === 0 || next > lane.mask ? first : next;
}

/**
 * Reactivates a lane of `consumer`'s live pass, suspended or the dormant
 * active one, with one cover step.
 */
function resumeLane(lane: Lane, consumer: ReactiveNode): void {
  if (lane === activeLane) syncActiveLane(lane);
  else suspendActiveLane();
  coverStep(lane, consumer);
  activateLane(lane);
}

/**
 * An edge was linked to the published owner: its producer joins the tape.
 * A producer that cannot take the tag, or that already carried the current
 * one, is decided aside (notePreparedLinkAside).
 */
export function notePreparedLink(edge: ReactiveEdge): void {
  const producer = edge.from;
  const producerState = producer.state;
  if ((producerState & preparedAbsenceMask) === 0) {
    producer.state = (producerState & preparedLaneKeep) | preparedLaneTag;
    producer.tailIn = edge;
  } else {
    notePreparedLinkAside(edge);
  }
}

/**
 * A link notePreparedLink does not settle. A producer that cannot take the
 * tag unpublishes the lane until the owner's next strike rechecks it. One
 * that already carried the current tag had no edge: an aliased generation,
 * replaced by the next one (bounded per pass, so a run of aliases cannot
 * cycle), after which the lane is dormant and recovers on the next step.
 */
function notePreparedLinkAside(edge: ReactiveEdge): void {
  const producer = edge.from;
  const producerState = producer.state;
  if ((producerState & (Computing | Watcher)) !== 0) {
    /* @ev coverage-drop(edge.to, 0) */
    preparedOwner = null;
    return;
  }
  const lane = activeLane as Lane;
  if (lane.regenerations < GENERATIONS - 1) {
    lane.regenerations++;
    /* @ev regenerate(edge.to, lane.regenerations) */
    nextGeneration(lane);
    lane.complete = false;
    lane.coveredUpTo = null;
    lane.suffixNext = null;
    lane.suffixCovered = false;
    activateLane(lane);
  }
  producer.state = (producerState & preparedLaneKeep) | preparedLaneTag;
  producer.tailIn = edge;
}
