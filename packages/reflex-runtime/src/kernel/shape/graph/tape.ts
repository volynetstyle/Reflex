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
 * The incoming list of a consumer C is an ordered tape of edges. Covering it
 * writes every producer's slot to its own cell of that tape:
 * `P.tailIn = edge(P -> C)`, an ordinary outgoing hint under INV-H, and sets
 * the membership bit of C's lane on P. The lookup's first probe, the hint,
 * then answers every existing pair of C in one comparison. Nothing is
 * created, moved or unlinked, so a throw at any point leaves the graph the
 * lookup would have left.
 *
 * Trigger. A lookup that leaves the locality tiers for the plain lockstep,
 * or whose finger race settles only in the far end of its window, is a
 * strike of its tracking pass, named by (consumer, pass stamp). The second
 * strike of a pass arms a lane for it. Strike records live in a small table;
 * a record of a live pass is never evicted, so a nested pass never erases an
 * outer one's history. When every record belongs to a live pass, a new pass
 * does not adapt.
 *
 * Lanes. Up to LANE_COUNT passes hold a lane at once, each with its own
 * membership bit (`Leased << lane`); nested passes therefore never share or
 * clear each other's bits. One lane is active: `preparedOwner` names its
 * owner, and links to it record their producer at once. The others are
 * suspended. A suspended owner is reactivated lazily, when its own lookup
 * next reaches the tape; it then covers the edges it accepted since it was
 * suspended, which are exactly those after its saved cursor (the prefix
 * grows only at its end). A pass that finds every lane live does not adapt.
 * Arming a lane whose owner's pass ended first clears that owner's bits
 * over its current list.
 *
 * Certificate. While the active lane is live (its owner Computing, its
 * frontier carrying the lane's stamp) and covered, every producer of an
 * attached incoming edge of the owner carries the lane's bit. An idle
 * producer without it therefore has no edge to the owner: a hint miss on it
 * proves absence. A bit without a cell (a computation of the producer,
 * another lane's cell, a raw kernel frame took the slot) sends the lookup on
 * to the exact search, so a lost cell costs a lookup, never a twin. A bit
 * left on a producer whose edge was dropped while its owner was suspended
 * is stale: it costs the lane's next owner one exact search, then is either
 * legitimate or cleared with that owner's lane.
 */

const LANE_COUNT = 4;
const STRIKE_RECORDS = 5;

interface Lane {
  owner: ReactiveNode | null;
  stamp: number;
  bit: number;
  covered: boolean;
  /** Last incoming edge covered when the lane was suspended; null: none. */
  coveredUpTo: ReactiveEdge | null;
}

const lanes: Lane[] = [];
for (let i = 0; i < LANE_COUNT; i++)
  lanes.push({
    owner: null,
    stamp: 0,
    bit: Leased << i,
    covered: false,
    coveredUpTo: null,
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
/** Every producer could take its cell and bit: the certificate's premise. */
var hasFullTapeCoverage = false;
var activeLane: Lane | null = null;

/** Disposal of `consumer`: no strike record or lane may retain it. */
export function forgetStrikeConsumer(consumer: ReactiveNode): void {
  for (let i = 0; i < STRIKE_RECORDS; i++)
    if (strikeConsumers[i] === consumer) strikeConsumers[i] = null;
  for (const lane of lanes) {
    if (lane.owner !== consumer) continue;
    // Its list is still attached here: its bits go with the lane.
    clearLaneBits(consumer, lane.bit);
    lane.owner = null;
    lane.coveredUpTo = null;
    if (lane === activeLane) {
      activeLane = null;
      preparedOwner = null;
    }
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

function clearLaneBits(owner: ReactiveNode, bit: number): void {
  for (
    let incomingEdge: ReactiveEdge | null = owner.firstIn;
    incomingEdge !== null;
    incomingEdge = incomingEdge.nextIn
  ) {
    incomingEdge.from.state &= ~bit;
  }
}

/**
 * Ends the active lane of `owner`: clears its bits over the owner's current
 * list. Whatever removes edges from the active owner's list (cleanup,
 * disposal) calls it first, so a producer never leaves the list with its
 * bit.
 */
export function releaseLease(owner: ReactiveNode): void {
  clearLaneBits(owner, preparedLaneBit);
  const lane = activeLane;
  if (lane !== null) {
    lane.owner = null;
    lane.coveredUpTo = null;
  }
  activeLane = null;
  preparedOwner = null;
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

  // A self-edge, a frontier slot or a watcher's saved slot carries no cell.
  return (
    hasFullTapeCoverage &&
    (producer.state & (Computing | Watcher | preparedLaneBit)) === 0 &&
    producer !== consumer
  );
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

  if (acquireTape(consumer) === false) return undefined;

  const slotEdge = producer.tailIn;
  if (
    slotEdge !== null &&
    slotEdge.to === consumer &&
    slotEdge.from === producer
  ) {
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
  if ((consumer.state & Computing) !== 0) void acquireTape(consumer);
  return edge;
}

/**
 * Makes `consumer`'s pass the active owner if it holds a suspended lane or
 * strikes for the second time and a lane is free. True when it became the
 * active owner.
 */
function acquireTape(consumer: ReactiveNode): boolean {
  const passStamp = getTrackingPassStamp(consumer);
  if (preparedOwner === consumer && preparedPassStamp === passStamp)
    return false;

  for (const lane of lanes) {
    if (lane.owner === consumer && lane.stamp === passStamp) {
      resumeLane(lane, consumer);
      return true;
    }
  }

  let free = -1;
  for (let i = 0; i < STRIKE_RECORDS; i++) {
    const recorded = strikeConsumers[i];
    if (recorded === consumer && strikeStamps[i] === passStamp) {
      // The second strike of this pass; later ones retry while every lane
      // is live.
      if (armLane(consumer, passStamp) === false) return false;
      strikeConsumers[i] = null;
      return true;
    }
    if (
      free < 0 &&
      (recorded === null ||
        isPassLive(recorded as ReactiveNode, strikeStamps[i] as number) ===
          false)
    ) {
      free = i;
    }
  }
  if (free >= 0) {
    strikeConsumers[free] = consumer;
    strikeStamps[free] = passStamp;
  }
  return false;
}

/** Leaves the active lane suspended, remembering how far it is covered. */
function suspendActiveLane(): void {
  const lane = activeLane;
  if (lane === null) return;
  lane.covered = hasFullTapeCoverage;
  // Everything up to the owner's frontier is covered: the arm walk covered
  // the list, links while active were recorded at once.
  lane.coveredUpTo = (lane.owner as ReactiveNode).tailIn;
  activeLane = null;
  preparedOwner = null;
}

function activateLane(lane: Lane): void {
  activeLane = lane;
  preparedOwner = lane.owner;
  preparedPassStamp = lane.stamp;
  preparedLaneBit = lane.bit;
  hasFullTapeCoverage = lane.covered;
}

/** Arms a free lane, or one whose owner's pass ended, for this pass. */
function armLane(consumer: ReactiveNode, passStamp: number): boolean {
  let lane: Lane | null = null;
  for (const candidate of lanes) {
    if (candidate.owner === null) {
      lane = candidate;
      break;
    }
  }
  if (lane === null) {
    for (const candidate of lanes) {
      if (
        isPassLive(candidate.owner as ReactiveNode, candidate.stamp) === false
      ) {
        lane = candidate;
        break;
      }
    }
  }
  if (lane === null) return false;

  if (lane === activeLane) {
    activeLane = null;
    preparedOwner = null;
  }
  if (lane.owner !== null) clearLaneBits(lane.owner, lane.bit);
  suspendActiveLane();

  const bit = lane.bit;
  let allProducersCovered = true;
  for (
    let incomingEdge: ReactiveEdge | null = consumer.firstIn;
    incomingEdge !== null;
    incomingEdge = incomingEdge.nextIn
  ) {
    const producer = incomingEdge.from;
    const producerState = producer.state;
    // INV-H: a Computing node's slot is a frontier, a watcher's is saved
    // and restored by validation. A self-edge comes from the consumer.
    if ((producerState & (Computing | Watcher)) === 0) {
      producer.state = producerState | bit;
      producer.tailIn = incomingEdge;
    } else {
      allProducersCovered = false;
    }
  }

  lane.owner = consumer;
  lane.stamp = passStamp;
  lane.covered = allProducersCovered;
  lane.coveredUpTo = null;
  activateLane(lane);
  return true;
}

/**
 * Reactivates a suspended lane of `consumer`'s live pass: covers the edges
 * it accepted since it was suspended, after the saved cursor up to the
 * current one.
 */
function resumeLane(lane: Lane, consumer: ReactiveNode): void {
  suspendActiveLane();

  const cursor = consumer.tailIn;
  let from = lane.coveredUpTo;
  if (cursor !== null && from !== cursor) {
    // A raw unlink may have detached the saved edge: then walk the prefix.
    if (
      from !== null &&
      (from.to !== consumer ||
        (from.prevIn === null && consumer.firstIn !== from))
    ) {
      from = null;
    }
    const bit = lane.bit;
    let covered = lane.covered;
    for (
      let incomingEdge = from === null ? consumer.firstIn : from.nextIn;
      incomingEdge !== null;
      incomingEdge = incomingEdge.nextIn
    ) {
      const producer = incomingEdge.from;
      const producerState = producer.state;
      if ((producerState & (Computing | Watcher)) === 0) {
        producer.state = producerState | bit;
        producer.tailIn = incomingEdge;
      } else {
        // Coverage stops at a producer that cannot take the bit.
        covered = false;
      }
      if (incomingEdge === cursor) break;
    }
    lane.covered = covered;
  }
  activateLane(lane);
}

/**
 * An edge was linked to the active owner: its producer joins the tape, or,
 * when its slot cannot hold a cell, the certificate is withdrawn.
 */
export function notePreparedLink(edge: ReactiveEdge): void {
  const producer = edge.from;
  const producerState = producer.state;
  if ((producerState & (Computing | Watcher)) === 0) {
    producer.state = producerState | preparedLaneBit;
    producer.tailIn = edge;
  } else {
    hasFullTapeCoverage = false;
  }
}
