// Outgoing locality of the pair lookup: a dense core of `consumers` active
// consumers that all read the same `deps` sources, where two orders vary
// independently.
//
//   read      the order in which one consumer reads its sources in a pass
//             (incoming locality: what the consumer-side tiers can predict)
//   schedule  the order in which the consumers run their passes in a round
//             (outgoing locality: what a producer-side finger can predict)
//
// Every source's outgoing list is built in consumer order 0..K-1 by the first
// round, with `gap` static subscribers between two consecutive consumers, so
// the forward schedule visits each producer's subscribers in list order, the
// reverse schedule against it, and the other schedules break the alignment
// in controlled ways. A pass first reads one shared selector (as the long ×
// long suite of ReactivePerformanceLab, whose consumers depend on a selector
// before their sources), then its sources.
//
// Kernel API of the internal entry, as scripts/tracking-ladder.mjs: every
// pass takes a fresh stamp, starts with `tailIn = null` and ends with the
// runtime's cleanup guard (`tailIn !== lastIn`).

const range = (n) => Array.from({ length: n }, (_, i) => i);

function permutation(seed, count) {
  const order = range(count);
  let state = seed + 1;
  for (let i = count - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Prime counts of precomputed orders never align with the round length.
const ORDERS = 61;
const ROUNDS = 67;
const EXTRA = 61;

/**
 * Read orders. `reads(round, k)` returns the source indices consumer k reads
 * in `round` (the selector excluded); `pool` is the number of sources.
 */
export const readOrders = {
  // Control: the same order every pass; every read is L0.
  stable: ({ deps }) => {
    const order = range(deps);
    return { pool: deps, reads: () => order };
  },
  // A fresh uniform permutation per pass, independent across consumers
  // (ReactivePerformanceLab long_long_shuffle).
  shuffle: ({ deps }) => {
    const orders = range(ORDERS).map((seed) => permutation(seed, deps));
    return {
      pool: deps,
      reads: (round, k) => orders[(round * 7 + k * 13) % ORDERS],
    };
  },
  // One permutation per round, shared by every consumer
  // (long_long_shared_shuffle).
  "shared-shuffle": ({ deps }) => {
    const orders = range(ORDERS).map((seed) => permutation(seed, deps));
    return { pool: deps, reads: (round) => orders[round % ORDERS] };
  },
  // A broad hub (source 0) re-read after every other read: the exact hint's
  // case, which a finger must not disturb.
  hub: ({ deps }) => {
    const order = [0, ...range(deps - 1).flatMap((i) => [i + 1, 0])];
    return { pool: deps, reads: () => order };
  },
  // A window of `deps` sources sliding by 4 per round, the same for every
  // consumer: new dependencies need proofs of absence.
  "window-4": ({ deps }) => {
    const pool = deps + EXTRA;
    return {
      pool,
      reads: (round) => range(deps).map((i) => (round * 4 + i) % pool),
    };
  },
};

/**
 * Schedules. `order(round)` returns the consumer indices that run in
 * `round`, in order.
 */
export const schedules = {
  // Consumer order = outgoing-list order: the lab's effect reading its
  // consumers in creation order, a watcher wave in notification order.
  forward: ({ consumers }) => {
    const order = range(consumers);
    return () => order;
  },
  // Against the outgoing lists.
  reverse: ({ consumers }) => {
    const order = range(consumers).reverse();
    return () => order;
  },
  // Forward and reverse rounds alternate.
  alternate: ({ consumers }) => {
    const orders = [range(consumers), range(consumers).reverse()];
    return (round) => orders[round & 1];
  },
  // Forward from a different start every round (a cyclic shift).
  rotate: ({ consumers }) => {
    const orders = range(ROUNDS).map((r) =>
      range(consumers).map((i) => (i + r * 7) % consumers),
    );
    return (round) => orders[round % ROUNDS];
  },
  // A random half of the consumers per round, in forward order (only the
  // dirty ones recompute).
  "subset-half": ({ consumers }) => {
    const orders = range(ROUNDS).map((r) =>
      permutation(r + 500, consumers)
        .slice(0, Math.max(1, consumers >> 1))
        .sort((a, b) => a - b),
    );
    return (round) => orders[round % ROUNDS];
  },
  // Forward order, with every adjacent pair swapped on odd rounds.
  "swap-pairs": ({ consumers }) => {
    const orders = [range(consumers), range(consumers).map((i) => i ^ 1)];
    if (consumers % 2 === 1) orders[1][consumers - 1] = consumers - 1;
    return (round) => orders[round & 1];
  },
  // Adversaries of a finger that follows the lookups: two consumers
  // alternate, one at the head of every outgoing list (which the base head
  // start answers without touching the slot) and one in the middle.
  "head-far": ({ consumers }) => {
    const order = [0, consumers >> 1];
    return () => order;
  },
  // Three: two at the head, one in the middle.
  "head-far-3": ({ consumers }) => {
    const order = [0, 1, consumers >> 1];
    return () => order;
  },
  // Two consumers a quarter of the list from each end: each finds the
  // other's edge in the slot, half the list away, while firstOut is a
  // quarter away.
  "far-pair": ({ consumers }) => {
    const order = [consumers >> 2, (3 * consumers) >> 2];
    return () => order;
  },
  // A fresh uniform order per round: no outgoing locality.
  random: ({ consumers }) => {
    const orders = range(ROUNDS).map((r) => permutation(r + 1000, consumers));
    return (round) => orders[round % ROUNDS];
  },
};

/** Every case id selected by comma-separated name parts (empty: all). */
export function localityCases({
  reads = "shuffle",
  schedules: scheduleSpec = "forward,reverse,random",
  deps = [128],
  consumers = [128],
  gaps = [0],
} = {}) {
  const cases = [];
  const pick = (spec, names) => {
    const parts = spec.split(",").filter(Boolean);
    return parts.length === 0
      ? names
      : names.filter((name) => parts.some((part) => name === part));
  };
  for (const read of pick(reads, Object.keys(readOrders)))
    for (const schedule of pick(scheduleSpec, Object.keys(schedules)))
      for (const d of deps)
        for (const k of consumers)
          for (const gap of gaps)
            cases.push({
              id: `${read}/${schedule}/d${d}k${k}${gap ? `g${gap}` : ""}`,
              read,
              schedule,
              deps: d,
              consumers: k,
              gap,
            });
  return cases;
}

/**
 * Build a case on runtime `r` and return `step(index)`, which runs one pass
 * of the consumer the schedule puts at position `index` and returns its final
 * stamp. `step.readsPerPass` counts the selector read too.
 */
export function outgoingLocality(
  r,
  {
    read = "shuffle",
    schedule = "forward",
    deps = 128,
    consumers = 128,
    gap = 0,
  },
) {
  const order = readOrders[read]({ deps });
  const plan = schedules[schedule]({ consumers });
  const node = () => new r.ReactiveNode(undefined, undefined, 0);
  const advance = r.advanceTrackingStamp ?? r.advanceTrackingEpoch;
  const selector = node();
  const sources = range(order.pool).map(node);
  const actives = range(consumers).map(node);

  const pass = (consumer, reads) => {
    advance();
    consumer.tailIn = null;
    r.resolveTrackedRead(selector, consumer);
    for (let i = 0; i < reads.length; i++)
      r.resolveTrackedRead(sources[reads[i]], consumer);
    if (consumer.tailIn !== consumer.lastIn)
      r.cleanupUnvisitedSources(consumer);
    // `version` before the 2026-10-24 rename; baselines may be older builds.
    return consumer.tailIn.stamp ?? consumer.tailIn.version;
  };

  // Round 0 subscribes in consumer order, `gap` statics after each consumer.
  for (let k = 0; k < consumers; k++) {
    pass(actives[k], order.reads(0, k));
    for (let g = 0; g < gap; g++) {
      const other = node();
      for (const source of sources) r.linkEdge(source, other);
    }
  }

  // Rounds are indexed from 1; a round may run fewer passes than `consumers`.
  const rounds = range(ROUNDS).map((r0) => plan(r0 + 1));
  let round = 0;
  let position = 0;
  let roundNumber = 1;
  const step = () => {
    const ks = rounds[round];
    const k = ks[position];
    const result = pass(actives[k], order.reads(roundNumber, k));
    if (++position === ks.length) {
      position = 0;
      roundNumber++;
      round = (round + 1) % ROUNDS;
    }
    return result;
  };
  step.readsPerPass = order.reads(1, 0).length + 1;
  return step;
}
