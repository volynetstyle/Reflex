/* eslint-disable no-var */
import type { ReactiveEdge } from "@runtime/kernel/shape/edge";
import { Computing, Leased, Watcher } from "@runtime/kernel/shape/meta";
import type ReactiveNode from "@runtime/kernel/shape/node";
import { trackingStamp } from "@runtime/kernel/state";

/**
 * The prepared tape: direct addressing of one consumer's incoming list,
 * entered when the pair lookup's locality stops paying (INV-P,
 * docs/INVARIANTS.md).
 *
 * The incoming list of a consumer C is an ordered tape of edges. Preparing
 * it writes, once, every producer's slot to its own cell of that tape:
 * `P.tailIn = edge(P -> C)`, an ordinary outgoing hint under INV-H. The
 * lookup's first probe, the hint, then answers every existing pair of C in
 * one comparison, and the order is still materialized by the usual moves of
 * existing edges. Nothing is created, moved or unlinked, so a throw at any
 * point leaves the graph the lookup would have left.
 *
 * Trigger. A lookup that leaves the locality tiers for the plain lockstep,
 * or whose finger race settles only in the far end of its window, is a
 * strike of its tracking pass. The PREPARE_STRIKES-th strike of a pass
 * prepares the tape. A tracking pass is named by (consumer, pass stamp);
 * the stamp alone is not unique across consumers. Another pass striking in
 * between restarts the count, so nesting only ever delays a prepare.
 *
 * Lease. The prepared consumer and its pass stamp: at most one at a time.
 * Live(C, s) holds while C is Computing and its frontier carries s. A dead
 * lease needs no eager cleanup: its cells are hints, the next prepare
 * replaces it, the owner's next miss past the hint releases it.
 *
 * Certificate. Under a live lease with coverage, every producer of an
 * attached incoming edge of the owner carries `Leased` (set by the prepare
 * and by every link to the owner). An idle producer without the bit
 * therefore has no edge to the owner: a hint miss on it proves absence. A
 * bit without a cell (a computation of the producer, another consumer's
 * hint, a raw kernel frame took the slot) sends the lookup on to the exact
 * search, so a lost cell costs a lookup, never a twin.
 */

/** Strikes of a tracking pass that prepare its tape. */
const PREPARE_STRIKES = 2;

/**
 * The lease owner, read on every continuation entry of a lookup and on
 * every link, so a `var` (no hole check), as the registers in state.ts.
 */
export var preparedOwner: ReactiveNode | null = null;
var preparedStamp = 0;
/** Every producer could take its cell and bit: the certificate's premise. */
var preparedCovered = false;

var strikeConsumer: ReactiveNode | null = null;
var strikeStamp = 0;
var strikeCount = 0;

/** The stamp the resolver gives the next read of a computing consumer. */
function passStampOf(consumer: ReactiveNode): number {
  const cursor = consumer.tailIn;
  return cursor !== null ? cursor.stamp : trackingStamp;
}

function isLeaseLive(owner: ReactiveNode): boolean {
  return (
    (owner.state & Computing) !== 0 && passStampOf(owner) === preparedStamp
  );
}

/** Ends the lease: clears the bits of the owner's current producers. */
function releaseLease(owner: ReactiveNode): void {
  for (
    let edge: ReactiveEdge | null = owner.firstIn;
    edge !== null;
    edge = edge.nextIn
  ) {
    edge.from.state &= ~Leased;
  }
  preparedOwner = null;
}

/**
 * Entry of a continuation of `producer -> consumer`'s lookup past the hint
 * and the head start, while `consumer` is the recorded owner: whether the
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
    preparedCovered &&
    (producer.state & (Computing | Watcher | Leased)) === 0 &&
    producer !== consumer
  );
}

/**
 * Entry of the plain lockstep for a computing consumer: the owner's
 * certificate, otherwise a strike. Returns the answer when the tape
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

  if (strikeReachesPrepare(consumer) === false) return undefined;

  const cell = producer.tailIn;
  if (cell !== null && cell.to === consumer && cell.from === producer) {
    return cell;
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
  if ((consumer.state & Computing) !== 0) strikeReachesPrepare(consumer);
  return edge;
}

/** Counts a strike; prepares on the PREPARE_STRIKES-th. True when prepared. */
function strikeReachesPrepare(consumer: ReactiveNode): boolean {
  const stamp = passStampOf(consumer);
  if (strikeConsumer !== consumer || strikeStamp !== stamp) {
    strikeConsumer = consumer;
    strikeStamp = stamp;
    strikeCount = 0;
  }
  if (++strikeCount < PREPARE_STRIKES) return false;

  const owner = preparedOwner;
  if (owner !== null) {
    // This pass is prepared already, or another lease is live: one owner.
    if (owner === consumer && preparedStamp === stamp) return false;
    if (isLeaseLive(owner) === true) return false;
    releaseLease(owner);
  }

  prepareTape(consumer, stamp);
  return true;
}

/** One pass over the consumer's incoming list: cells and bits. */
function prepareTape(consumer: ReactiveNode, stamp: number): void {
  let covered = true;

  for (
    let edge: ReactiveEdge | null = consumer.firstIn;
    edge !== null;
    edge = edge.nextIn
  ) {
    const producer = edge.from;
    const state = producer.state;
    // INV-H: a Computing node's slot is a frontier, a watcher's is saved
    // and restored by validation. A self-edge comes from the consumer.
    if ((state & (Computing | Watcher)) === 0) {
      producer.state = state | Leased;
      producer.tailIn = edge;
    } else {
      covered = false;
    }
  }

  preparedOwner = consumer;
  preparedStamp = stamp;
  preparedCovered = covered;
}

/**
 * An edge was linked to the recorded owner: its producer joins the tape,
 * or, when its slot cannot hold a cell, the certificate is withdrawn.
 */
export function notePreparedLink(edge: ReactiveEdge): void {
  const producer = edge.from;
  const state = producer.state;
  if ((state & (Computing | Watcher)) === 0) {
    producer.state = state | Leased;
    producer.tailIn = edge;
  } else {
    preparedCovered = false;
  }
}
