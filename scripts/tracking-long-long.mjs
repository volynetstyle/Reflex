// Wide x wide tracking workload: consumers with many dependencies read
// producers with many subscribers, in a fresh shuffled order every pass.
// Shared by scripts/compare-tracking-graph.mjs (timing) and
// packages/reflex-runtime/perf/tracking-pair-lookup/analyze.mjs (link counts
// and the simulated producer-slot hit rate).
//
// One step runs one pass of one active consumer, chosen by `schedule`:
//   fixed     round-robin in the same consumer order every round
//   shuffled  every round visits the consumers in a new order
// `nestEvery > 0` runs a complete nested pass of another active consumer
// after every `nestEvery` reads, as a dirty computed read inside a
// computation does; nested passes advance the epoch mid-pass.

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

export function longLong(
  r,
  {
    producers = 512,
    fanout = 64,
    active = 1,
    schedule = "fixed",
    nestEvery = 0,
    onRead,
    onPassStart,
  } = {},
) {
  const node = () => new r.ReactiveNode(undefined, undefined, 0);
  const sources = range(producers).map(node);
  const statics = Math.max(0, fanout - active);
  const linkStatics = (count) => {
    for (let i = 0; i < count; i++) {
      const other = node();
      for (const source of sources) r.linkEdge(source, other);
    }
  };
  // 61 orders: a prime count never aligns with the consumer rotation, so a
  // consumer does not meet the same order on every pass.
  const orders = range(61).map((seed) => permutation(seed, producers));
  const consumerOrders = range(64).map((seed) =>
    permutation(seed + 1000, active),
  );
  const consumers = range(active).map(node);

  let passSeed = 0;
  const pass = (index, nested) => {
    const consumer = consumers[index];
    const order = orders[passSeed++ % orders.length];
    (r.advanceTrackingStamp ?? r.advanceTrackingEpoch)();
    consumer.tailIn = null;
    onPassStart?.(consumer);
    for (let i = 0; i < order.length; i++) {
      const producer = sources[order[i]];
      onRead?.(producer, consumer);
      r.resolveTrackedRead(producer, consumer);
      if (
        nested &&
        nestEvery > 0 &&
        active > 1 &&
        i % nestEvery === nestEvery - 1
      )
        pass((index + 1 + (i % (active - 1))) % active, false);
    }
    if (consumer.tailIn !== consumer.lastIn)
      r.cleanupUnvisitedSources(consumer);
    // `version` before the 2026-10-24 rename; baselines may be older builds.
    return consumer.tailIn.stamp ?? consumer.tailIn.version;
  };

  // Half of the static subscribers precede the active consumers in every
  // outgoing list, half follow them.
  linkStatics(statics >> 1);
  for (let c = 0; c < active; c++) pass(c, false);
  linkStatics(statics - (statics >> 1));

  const step = (index) => {
    const round = Math.floor(index / active);
    const slot = index % active;
    const consumer =
      schedule === "shuffled"
        ? consumerOrders[round % consumerOrders.length][slot]
        : slot;
    return pass(consumer, true);
  };
  step.sources = sources;
  step.consumers = consumers;
  return step;
}

export const longLongModes = {
  "long-long-single": { active: 1 },
  "long-long-8-fixed": { active: 8, schedule: "fixed" },
  "long-long-64-fixed": { active: 64, schedule: "fixed" },
  "long-long-8-shuffled": { active: 8, schedule: "shuffled" },
  "long-long-64-shuffled": { active: 64, schedule: "shuffled" },
  "long-long-8-nested": { active: 8, schedule: "shuffled", nestEvery: 128 },
};
