// Tracking degradation ladder: one base graph, one rung per lost property.
//
// Every rung runs passes of one consumer C over the same pool of sources.
// Each source has `fanout - 1` static subscribers besides C, half before and
// half after C's first edge in its outgoing list; C reads `deps` distinct
// sources per pass. A rung changes only the read sequence of C's passes (in
// rungs 09 and 19 the other subscribers re-track as well, rung 12 nests a second
// consumer), so the cost difference between two rungs at the same (deps,
// fanout) is the price of the property the later rung gives up. Rungs are
// ordered by the property they destroy, not by cost; which tier actually
// answers each read is measured by
// packages/reflex-runtime/perf/tracking-ladder/analyze.mjs, the time by
// packages/reflex-runtime/perf/tracking-ladder/time.mjs.
//
// Kernel API of the internal entry, as scripts/tracking-long-long.mjs: every
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

// 61 precomputed variants: a prime period never aligns with another cycle.
const PERIOD = 61;
const EXTRA = 61;

/**
 * `reads(pass, k)` returns the source indices consumer `k` (C is 0) reads in
 * pass `pass`, `pool` the number of sources. `shared` replaces the static
 * subscribers by active consumers; `nested` (rung 12) describes a second
 * consumer whose complete pass runs after every `every` reads of C.
 */
export const ladderRungs = {
  // L0a: the order is exactly the previous pass's.
  "01.exact": ({ deps }) => {
    const order = range(deps);
    return { pool: deps, reads: () => order };
  },
  // L0b: every dependency is read twice in a row.
  "02.dup-adjacent": ({ deps }) => {
    const order = range(deps).flatMap((i) => [i, i]);
    return { pool: deps, reads: () => order };
  },
  // L0c: adjacent pairs swap on every other pass (one hop).
  "03.swap-adjacent": ({ deps }) => {
    const orders = [range(deps), range(deps).map((i) => i ^ 1)];
    return { pool: deps, reads: (p) => orders[p & 1] };
  },
  // L0c: a fresh permutation inside every block of 4 (displacement < 4).
  "04.bounded-4": ({ deps }) => {
    const orders = range(PERIOD).map((seed) => {
      const order = range(deps);
      for (let block = 0; block + 4 <= deps; block += 4) {
        const local = permutation(seed * 977 + block, 4);
        for (let j = 0; j < 4; j++) order[block + j] = block + local[j];
      }
      return order;
    });
    return { pool: deps, reads: (p) => orders[p % PERIOD] };
  },
  // L0c: the previous pass's last dependency is read first (rotation).
  "05.tail-move": ({ deps }) => {
    const orders = range(deps).map((p) =>
      range(deps).map((i) => (i - p + deps) % deps),
    );
    return { pool: deps, reads: (p) => orders[p % deps] };
  },
  // L0d: the last 32 dependencies alternate between two disjoint branches.
  "06.branch-end": ({ deps }) => {
    const common = range(deps - 32);
    const orders = [0, 1].map((side) => [
      ...common,
      ...range(32).map((j) => deps - 32 + side * 32 + j),
    ]);
    return { pool: deps + 32, reads: (p) => orders[p & 1] };
  },
  // L0d: the same branch between two halves of the common dependencies.
  "07.branch-mid": ({ deps }) => {
    const common = range(deps - 32);
    const half = common.length >> 1;
    const orders = [0, 1].map((side) => [
      ...common.slice(0, half),
      ...range(32).map((j) => deps - 32 + side * 32 + j),
      ...common.slice(half),
    ]);
    return { pool: deps + 32, reads: (p) => orders[p & 1] };
  },
  // L1/L2+: a fresh random permutation every pass. Low fan-out keeps it on
  // the producer side; high fan-out joins the two degrees.
  "08.shuffle": ({ deps }) => {
    const orders = range(PERIOD).map((seed) => permutation(seed, deps));
    return { pool: deps, reads: (p) => orders[p % PERIOD] };
  },
  // L2+: the same shuffle, but every subscriber of every source is a
  // consumer that re-tracks: `fanout` consumers share the pool and run their
  // passes in turn, each in its own sequence of permutations. A producer's
  // slot then holds the pair of whichever consumer looked it up last.
  "09.shuffle-shared": ({ deps }) => {
    const orders = range(PERIOD).map((seed) => permutation(seed, deps));
    return {
      pool: deps,
      shared: true,
      reads: (p, k = 0) => orders[(p + 7 * k) % PERIOD],
    };
  },
  // L1h: one broad producer re-read after every other read
  // (items.map((i) => f(i, hub()))). Source 0 is the hub.
  "10.hub-repeat": ({ deps }) => {
    const order = [0, ...range(deps - 1).flatMap((i) => [i + 1, 0])];
    return { pool: deps, reads: () => order };
  },
  // L1h: two hubs, each with its own slot.
  "11.hub-two": ({ deps }) => {
    const order = [0, 1, ...range(deps - 2).flatMap((i) => [i + 2, 0, 1])];
    return { pool: deps, reads: () => order };
  },
  // L1h → L2+: the hub is shared with a second wide consumer whose passes
  // nest inside C's (a dirty computed read during the computation) and
  // overwrite the hub's slot.
  "12.hub-nested": ({ deps }) => {
    const order = [0, ...range(deps - 1).flatMap((i) => [i + 1, 0])];
    const nestedOrder = [0, ...range(8).flatMap((i) => [i + 1, 0])];
    return {
      pool: deps,
      reads: () => order,
      nested: { reads: () => nestedOrder, every: 16 },
    };
  },
  // L2−: one new dependency per pass at the end of the list; the previous
  // pass's new dependency is cleaned up.
  "13.novel-one-end": ({ deps }) => {
    const orders = range(EXTRA).map((x) => [...range(deps - 1), deps - 1 + x]);
    return { pool: deps - 1 + EXTRA, reads: (p) => orders[p % EXTRA] };
  },
  // L2−: the same new dependency in the middle of the list.
  "14.novel-one-mid": ({ deps }) => {
    const half = (deps - 1) >> 1;
    const orders = range(EXTRA).map((x) => [
      ...range(half),
      deps - 1 + x,
      ...range(deps - 1 - half).map((i) => half + i),
    ]);
    return { pool: deps - 1 + EXTRA, reads: (p) => orders[p % EXTRA] };
  },
  // L2−: 16 new dependencies per pass at the end of the list.
  "15.novel-many-end": ({ deps }) => {
    const fresh = 16;
    const orders = range(EXTRA).map((p) => [
      ...range(deps - fresh),
      ...range(fresh).map((j) => deps - fresh + ((p * fresh + j) % EXTRA)),
    ]);
    return { pool: deps - fresh + EXTRA, reads: (p) => orders[p % EXTRA] };
  },
  // L3: the new dependency is read first, in front of the whole old list.
  "16.novel-front": ({ deps }) => {
    const orders = range(EXTRA).map((x) => [deps - 1 + x, ...range(deps - 1)]);
    return { pool: deps - 1 + EXTRA, reads: (p) => orders[p % EXTRA] };
  },
  // L3: a window of `deps` consecutive sources slides by 1 per pass.
  "17.window-1": ({ deps }) => windowSlide(deps, 1),
  // L3: the window slides by 16 per pass.
  "18.window-16": ({ deps }) => windowSlide(deps, 16),
  // L3 + L2+: every subscriber is a sliding consumer, each window at its own
  // offset, so a retained read of C no longer finds its edge newest in P.out.
  "19.window-16-shared": ({ deps }) => windowSlide(deps, 16, true),
};

function windowSlide(deps, slide, shared = false) {
  const pool = deps + EXTRA;
  const passes = pool / gcd(pool, slide);
  const orders = range(passes).map((p) =>
    range(deps).map((i) => (p * slide + i) % pool),
  );
  return {
    pool,
    shared,
    reads: (p, k = 0) => orders[(p + 5 * k) % passes],
  };
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Build rung `name` on runtime `r` and return `step(index)`, which runs one
 * pass and returns its final stamp: a pass of C, or with `shared` a pass of
 * consumer `index % fanout` in turn. `step.readsPerPass` is the number of
 * tracked reads of one step, nested passes included; `step.sources` and
 * `step.expected(index)` (the consumer of that step and its distinct reads,
 * in order) expose the graph to checks and analysis tools.
 */
export function ladder(r, name, { deps = 128, fanout = 3, onPassStart } = {}) {
  const rung = ladderRungs[name]({ deps });
  const node = () => new r.ReactiveNode(undefined, undefined, 0);
  const advance = r.advanceTrackingStamp ?? r.advanceTrackingEpoch;
  const sources = range(rung.pool).map(node);
  const consumer = node();
  const nestedConsumer = rung.nested ? node() : null;
  const linkStatics = (count) => {
    for (let i = 0; i < count; i++) {
      const other = node();
      for (const source of sources) r.linkEdge(source, other);
    }
  };

  const pass = (target, reads, nest) => {
    advance();
    target.tailIn = null;
    onPassStart?.(target);
    for (let i = 0; i < reads.length; i++) {
      r.resolveTrackedRead(sources[reads[i]], target);
      if (nest !== null && i % nest.every === nest.every - 1) {
        pass(nestedConsumer, nest.reads(0), null);
      }
    }
    if (target.tailIn !== target.lastIn) r.cleanupUnvisitedSources(target);
    // `version` before the 2026-10-24 rename; baselines may be older builds.
    return target.tailIn.stamp ?? target.tailIn.version;
  };

  const consumers = [consumer];
  if (rung.shared) {
    for (let k = 1; k < fanout; k++) consumers.push(node());
    consumers.forEach((c, k) => pass(c, rung.reads(0, k), null));
  } else {
    const statics = Math.max(0, fanout - 1);
    linkStatics(statics >> 1);
    pass(consumer, rung.reads(0), null);
    if (nestedConsumer !== null)
      pass(nestedConsumer, rung.nested.reads(0), null);
    linkStatics(statics - (statics >> 1));
  }

  const turn = (index) => {
    const k = index % consumers.length;
    const p = Math.floor(index / consumers.length) + 1;
    return { k, reads: rung.reads(p, k) };
  };
  const step = (index) => {
    const { k, reads } = turn(index);
    return pass(consumers[k], reads, rung.nested ?? null);
  };
  const nestedReads = rung.nested
    ? Math.floor(rung.reads(1).length / rung.nested.every) *
      rung.nested.reads(0).length
    : 0;
  step.readsPerPass = rung.reads(1).length + nestedReads;
  step.sources = sources;
  step.expected = (index) => {
    const { k, reads } = turn(index);
    return {
      consumer: consumers[k],
      sources: [...new Set(reads)].map((i) => sources[i]),
    };
  };
  return step;
}

/** Every (rung, fanout) case selected by a rung regex and a fan-out list. */
export function ladderCases({ rungs = /.*/, fanouts = [3, 128], deps = 128 }) {
  const cases = [];
  for (const name of Object.keys(ladderRungs)) {
    if (!rungs.test(name)) continue;
    for (const fanout of fanouts)
      cases.push({ id: `${name}/f${fanout}`, name, deps, fanout });
  }
  return cases;
}
